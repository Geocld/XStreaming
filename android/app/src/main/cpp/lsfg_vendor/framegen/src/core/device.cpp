#include <volk.h>
#include <vulkan/vulkan_core.h>

#include "core/device.hpp"
#include "core/image.hpp"
#include "core/instance.hpp"
#include "common/exception.hpp"

#include <cstdint>
#include <cstring>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#ifdef __ANDROID__
#include <android/log.h>
#define LSFG_FRAMEGEN_LOGI(...) \
    __android_log_print(ANDROID_LOG_INFO, "lsfg-vk-framegen", __VA_ARGS__)
#define LSFG_FRAMEGEN_LOGW(...) \
    __android_log_print(ANDROID_LOG_WARN, "lsfg-vk-framegen", __VA_ARGS__)
#else
#define LSFG_FRAMEGEN_LOGI(...) do {} while (0)
#define LSFG_FRAMEGEN_LOGW(...) do {} while (0)
#endif

// Build-fingerprint stamp. The string changes whenever this file is edited
// (via __DATE__/__TIME__), which forces NDK/CMake to detect a real source-level
// change rather than reusing the cached `lsfg-vk-framegen.a`. The variable is
// referenced from Device::Device so the linker can't dead-strip it; the value
// also lands in the runtime log so users/devs can confirm a fresh build is on
// the device by grepping for "framegen build stamp".
namespace LSFG::Core {
extern const char* kFramegenBuildStamp;
const char* kFramegenBuildStamp =
    "framegen build stamp: " __DATE__ " " __TIME__;
}

using namespace LSFG::Core;

const std::vector<const char*> requiredExtensions = {
#ifndef __ANDROID__
    "VK_KHR_external_memory_fd",
    "VK_KHR_external_semaphore_fd",
#else
    // On Android we share via AHardwareBuffer, not opaque FDs.
    "VK_ANDROID_external_memory_android_hardware_buffer",
    "VK_KHR_external_memory",                  // base ext, dependency
    "VK_KHR_sampler_ycbcr_conversion",         // dependency of AHB ext
    "VK_KHR_dedicated_allocation",             // required for dedicated AHB import
    "VK_KHR_get_memory_requirements2",         // dependency
    "VK_KHR_bind_memory2",                     // dependency
    "VK_KHR_maintenance1",                     // dependency
#endif
};

namespace {

bool hasExtension(const std::vector<VkExtensionProperties>& extensions, const char* name) {
    for (const auto& extension : extensions) {
        if (std::strcmp(extension.extensionName, name) == 0) return true;
    }
    return false;
}

} // namespace

const Image& Device::getFallbackDescriptorImage() const {
    return *this->fallbackDescriptorImage;
}

Device::Device(const Instance& instance, uint64_t deviceUUID) {
    // First line of any framegen device init: prints the build stamp at INFO.
    // Functionality-irrelevant by design — its only purpose is to give field
    // testers a single grep-able marker that proves the loaded .so contains
    // the storage-image / DEVICE_LOST fix series. If the user hits DEVICE_LOST
    // and this line is absent from logcat, their APK was linked against a
    // stale cached `lsfg-vk-framegen.a` and a clean rebuild is required.
    LSFG_FRAMEGEN_LOGI("Entering Device::Device — %s", kFramegenBuildStamp);

    // get all physical devices
    uint32_t deviceCount{};
    auto res = vkEnumeratePhysicalDevices(instance.handle(), &deviceCount, nullptr);
    if (res != VK_SUCCESS || deviceCount == 0)
        throw LSFG::vulkan_error(res, "Failed to enumerate physical devices");

    std::vector<VkPhysicalDevice> devices(deviceCount);
    res = vkEnumeratePhysicalDevices(instance.handle(), &deviceCount, devices.data());
    if (res != VK_SUCCESS)
        throw LSFG::vulkan_error(res, "Failed to get physical devices");

    // get device by uuid
    std::optional<VkPhysicalDevice> physicalDevice;
    uint32_t apiVersion = VK_API_VERSION_1_0;
    for (const auto& device : devices) {
        VkPhysicalDeviceProperties properties;
        vkGetPhysicalDeviceProperties(device, &properties);

        const uint64_t uuid =
            static_cast<uint64_t>(properties.vendorID) << 32 | properties.deviceID;
        if (deviceUUID == uuid || deviceUUID == 0x1463ABAC) {
            physicalDevice = device;
            apiVersion = properties.apiVersion;
            break;
        }
    }
    if (!physicalDevice)
        throw LSFG::vulkan_error(VK_ERROR_INITIALIZATION_FAILED,
            "Could not find physical device with UUID");

    const bool api12 = apiVersion >= VK_API_VERSION_1_2;
    const bool api13 = apiVersion >= VK_API_VERSION_1_3;

    // find queue family indices
    uint32_t familyCount{};
    vkGetPhysicalDeviceQueueFamilyProperties(*physicalDevice, &familyCount, nullptr);

    std::vector<VkQueueFamilyProperties> queueFamilies(familyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(*physicalDevice, &familyCount, queueFamilies.data());

    std::optional<uint32_t> computeFamilyIdx;
    for (uint32_t i = 0; i < familyCount; ++i) {
        if (queueFamilies[i].queueFlags & VK_QUEUE_COMPUTE_BIT)
            computeFamilyIdx = i;
    }
    if (!computeFamilyIdx)
        throw LSFG::vulkan_error(VK_ERROR_INITIALIZATION_FAILED, "No compute queue family found");

    uint32_t extensionCount{};
    res = vkEnumerateDeviceExtensionProperties(*physicalDevice, nullptr, &extensionCount, nullptr);
    if (res != VK_SUCCESS)
        throw LSFG::vulkan_error(res, "Failed to enumerate device extensions");
    std::vector<VkExtensionProperties> availableExtensions(extensionCount);
    res = vkEnumerateDeviceExtensionProperties(*physicalDevice, nullptr,
        &extensionCount, availableExtensions.data());
    if (res != VK_SUCCESS)
        throw LSFG::vulkan_error(res, "Failed to get device extensions");

    std::vector<const char*> enabledExtensions;
    enabledExtensions.reserve(requiredExtensions.size() + 1);
    for (const char* extension : requiredExtensions) {
        if (!hasExtension(availableExtensions, extension)) {
            throw LSFG::vulkan_error(VK_ERROR_EXTENSION_NOT_PRESENT,
                std::string("Missing required device extension: ") + extension);
        }
        enabledExtensions.push_back(extension);
    }

    const bool hasRobustness2 =
        hasExtension(availableExtensions, VK_EXT_ROBUSTNESS_2_EXTENSION_NAME);
    if (hasRobustness2) {
        enabledExtensions.push_back(VK_EXT_ROBUSTNESS_2_EXTENSION_NAME);
    }

    // The compute chain (BarrierBuilder, external acquire/release) calls
    // vkCmdPipelineBarrier2. That entry point is core in Vulkan 1.3 and comes
    // from VK_KHR_synchronization2 on 1.1/1.2.
    //
    // On devices that have NEITHER 1.3 nor the sync2 extension (e.g. Mali-G57
    // MC2 with API 1.1.177), we route every barrier through Utils::cmdPipelineBarrier2,
    // which translates VkDependencyInfo into the legacy sync1
    // vkCmdPipelineBarrier signature at runtime. Framegen's barriers only use
    // stage/access bits whose low 32 bits match between sync1 and sync2, so
    // the translation is functionally equivalent. We log which path is taken
    // so it's obvious in field reports.
    const bool hasSync2Ext = hasExtension(availableExtensions,
        VK_KHR_SYNCHRONIZATION_2_EXTENSION_NAME);
    if (!api13 && hasSync2Ext) {
        enabledExtensions.push_back(VK_KHR_SYNCHRONIZATION_2_EXTENSION_NAME);
    }
    // Same story for timeline semaphores: core in 1.2, extension on 1.1.
    // Framegen's CommandBuffer::submit takes optional timeline values and the
    // structure type is queried from runtime. If the device doesn't support
    // timeline semaphores at all, framegen still can't run.
    const bool hasTimelineSemExt = hasExtension(availableExtensions,
        VK_KHR_TIMELINE_SEMAPHORE_EXTENSION_NAME);
    if (!api12) {
        if (!hasTimelineSemExt) {
            throw LSFG::vulkan_error(VK_ERROR_EXTENSION_NOT_PRESENT,
                "VK_KHR_timeline_semaphore not available on this device "
                "(apiVersion < 1.2 and the extension is absent)");
        }
        enabledExtensions.push_back(VK_KHR_TIMELINE_SEMAPHORE_EXTENSION_NAME);
    }
    // vulkanMemoryModel: core-promoted in 1.2 but optional. On 1.1 it lives in
    // VK_KHR_vulkan_memory_model and is required by the framegen shaders that
    // use coherent memory accesses across workgroups.
    const bool hasVulkanMemoryModelExt = hasExtension(availableExtensions,
        VK_KHR_VULKAN_MEMORY_MODEL_EXTENSION_NAME);
    if (!api12 && hasVulkanMemoryModelExt) {
        enabledExtensions.push_back(VK_KHR_VULKAN_MEMORY_MODEL_EXTENSION_NAME);
    }
    // shaderFloat16 is gated by VK_KHR_shader_float16_int8 on 1.1; promoted to
    // core in 1.2. Only request it if the extension/feature is actually present
    // (we'll probe the feature itself below).
    const bool hasFloat16ExtName = hasExtension(availableExtensions,
        VK_KHR_SHADER_FLOAT16_INT8_EXTENSION_NAME);
    if (!api12 && hasFloat16ExtName) {
        enabledExtensions.push_back(VK_KHR_SHADER_FLOAT16_INT8_EXTENSION_NAME);
    }

    // Probe FP16 support on this physical device. The LSFG-Android port can
    // load precompiled SPIR-V FP16 shader variants from Lossless.dll (resource
    // IDs 304..351) which carry `OpCapability Float16`. Vulkan rejects those at
    // vkCreateShaderModule time unless the device was created with the
    // shaderFloat16 feature explicitly enabled. We probe and unconditionally
    // enable it when supported — there's no downside on FP32-only sessions and
    // it lets the FP16 path "just work" when the user toggles it on.
    //
    // Also probe the core 1.0 storage-image features. The LSFG compute shader
    // chain reads from and writes to R16G16B16A16_SFLOAT storage images
    // (gamma/delta/generate); on Mali (Bifrost/Valhall) this is rejected at
    // dispatch time and surfaces as VK_ERROR_DEVICE_LOST on the first present
    // unless `shaderStorageImageExtendedFormats` is explicitly enabled at
    // device-create time. The same applies to image read/write without an
    // explicit `format` qualifier in SPIR-V — without
    // `shaderStorageImageReadWithoutFormat` / `WriteWithoutFormat` the driver
    // is allowed to UB the dispatch. Enable each only when the physical device
    // advertises it (the validation layers reject create_device with features
    // the device doesn't support, and several PowerVR/Adreno revisions only
    // expose a subset).
    VkPhysicalDeviceShaderFloat16Int8Features fp16Probe{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SHADER_FLOAT16_INT8_FEATURES,
    };
    // Probe vulkanMemoryModel / timelineSemaphore through the core 1.2 feature
    // struct on api>=1.2 devices. vulkanMemoryModel is *optional* in core 1.2/1.3
    // and notoriously absent on Mali Bifrost/Valhall (G57/G68/G77). Some Mali
    // drivers silently accept a request for the unsupported feature at
    // vkCreateDevice time, then DEVICE_LOST on the first compute dispatch — which
    // is exactly what we see on the Mali-G57 (API 1.3.225) field log: device
    // creation succeeds, the first presentContext submits a command buffer, and
    // the driver returns VK_ERROR_DEVICE_LOST (-4) because the shader's
    // OpCapability VulkanMemoryModel was never legally enabled.
    VkPhysicalDeviceVulkan12Features vk12Probe{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES,
    };
    VkPhysicalDeviceVulkan13Features vk13Probe{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES,
    };
    void* probeNext = &fp16Probe;
    if (api12) {
        vk12Probe.pNext = probeNext;
        probeNext = &vk12Probe;
    }
    if (api13) {
        vk13Probe.pNext = probeNext;
        probeNext = &vk13Probe;
    }
    VkPhysicalDeviceFeatures2 featsProbe{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2,
        .pNext = probeNext,
    };
    vkGetPhysicalDeviceFeatures2(*physicalDevice, &featsProbe);
    const bool hasFloat16 = fp16Probe.shaderFloat16 == VK_TRUE;
    const VkPhysicalDeviceFeatures& probedCore = featsProbe.features;
    // Promoted-core probe results. On api<1.2 these stay false and we fall
    // through to the extension-based path below (which has its own probes).
    const bool hasVulkanMemoryModelCore = api12 && vk12Probe.vulkanMemoryModel == VK_TRUE;
    const bool hasTimelineSemCore = api12 && vk12Probe.timelineSemaphore == VK_TRUE;
    const bool hasSync2Core = api13 && vk13Probe.synchronization2 == VK_TRUE;
    const bool sync2FeatureEnabled = api13 ? hasSync2Core : hasSync2Ext;

    // Build the core feature struct we'll request. We must only request what
    // the device supports — anything else fails vkCreateDevice. All four
    // fields below are required by the LSFG shader chain on Mali; absence
    // would manifest as DEVICE_LOST on first dispatch.
    VkPhysicalDeviceFeatures enabledCoreFeatures{};
    enabledCoreFeatures.shaderStorageImageExtendedFormats =
        probedCore.shaderStorageImageExtendedFormats;
    enabledCoreFeatures.shaderStorageImageReadWithoutFormat =
        probedCore.shaderStorageImageReadWithoutFormat;
    enabledCoreFeatures.shaderStorageImageWriteWithoutFormat =
        probedCore.shaderStorageImageWriteWithoutFormat;
    // shaderInt16 commonly accompanies FP16 paths; harmless on FP32-only sessions
    // and required by some Lossless.dll FP16 shader variants.
    enabledCoreFeatures.shaderInt16 = probedCore.shaderInt16;

    // Diagnostic: log which storage-image features were probed vs. enabled.
    // Tagged "lsfg-vk-framegen" so it's easy to correlate with session logs.
    // On Mali-G57 this is the load-bearing line: if any of the *Format* fields
    // shows probed=0, the device cannot legally execute LSFG's compute chain
    // and presentContext will hit DEVICE_LOST regardless of this fix.
    //
    // The build stamp below is referenced (and printed) here so the linker
    // can't dead-strip it and so users running an older cached .so can verify
    // by log-grep whether the build they have actually contains this fix.
    LSFG_FRAMEGEN_LOGI("%s", kFramegenBuildStamp);
    LSFG_FRAMEGEN_LOGI(
        "Device features probe: storageImageExtendedFormats=%d, "
        "storageImageReadWithoutFormat=%d, storageImageWriteWithoutFormat=%d, "
        "shaderInt16=%d, shaderFloat16=%d, robustness2=%d, "
        "vulkanMemoryModel(core)=%d, timelineSemaphore(core)=%d, sync2(core)=%d",
        (int)probedCore.shaderStorageImageExtendedFormats,
        (int)probedCore.shaderStorageImageReadWithoutFormat,
        (int)probedCore.shaderStorageImageWriteWithoutFormat,
        (int)probedCore.shaderInt16,
        (int)hasFloat16,
        (int)hasRobustness2,
        (int)hasVulkanMemoryModelCore,
        (int)hasTimelineSemCore,
        (int)hasSync2Core);
    if (probedCore.shaderStorageImageExtendedFormats != VK_TRUE) {
        // Hard warning: this is the feature LSFG's R16G16B16A16_SFLOAT storage
        // image accesses depend on. Without it, dispatch is undefined behavior
        // on Mali/Adreno and surfaces as DEVICE_LOST on first present. There's
        // no shader-side workaround we can apply at runtime; logging it loudly
        // gives upstream / users a clear pointer to the actual root cause.
        LSFG_FRAMEGEN_LOGW(
            "shaderStorageImageExtendedFormats=FALSE — LSFG compute chain "
            "expects R16G16B16A16_SFLOAT storage; first dispatch will likely "
            "DEVICE_LOST on this device");
    }

    // vulkanMemoryModel is only required by the DXBC→SPIR-V translator path
    // (thirdparty/dxbc emits OpCapability VulkanMemoryModel unconditionally).
    // The Lossless precompiled FP16 SPIR-V blobs (resource IDs 304..351) use
    // OpMemoryModel Logical GLSL450 with NO VulkanMemoryModel capability —
    // verified across all 49 blobs by disassembling them (see _analysis/*.dis).
    //
    // So a Mali Bifrost/Valhall device (G57/G68/G77 — no vulkanMemoryModel
    // support) CAN run framegen IF the user enables the FP16 toggle: the
    // shader loader then bypasses dxvk and feeds the device the precompiled
    // GLSL450 SPIR-V directly. We therefore do NOT fail-fast here; the device
    // is created without vulkanMemoryModel enabled (the gating above turned
    // the request into VK_FALSE), shader load via the FP16 path will succeed,
    // and dispatch will work. If the user has FP16 disabled on such a device,
    // the DXBC path's first dispatch will DEVICE_LOST — that's caught later
    // by lsfg_render_loop's auto-disable, and the diagnostic line above
    // ("vulkanMemoryModel(core)=0") points the field reporter at the cause.

    // create logical device
    const float queuePriority{1.0F}; // highest priority

    // Feature chain. The shape depends on the device's apiVersion:
    //   1.3+: chain VkPhysicalDeviceVulkan1{2,3}Features (these structs are only
    //         valid on devices that advertise the corresponding core version).
    //   1.1/1.2: chain extension-specific feature structs
    //         (VkPhysicalDeviceSynchronization2FeaturesKHR, etc.). The promoted
    //         core structs would have unknown sType on a 1.1 driver — Mali
    //         drivers in particular have been observed to silently corrupt
    //         state when handed an unrecognized core feature struct, leading
    //         to SIGSEGV on the first dispatch even though vkCreateDevice
    //         appeared to succeed.
    //
    // Every feature is gated on actually being supported (probedCore /
    // hasFloat16 / hasRobustness2 / hasVulkanMemoryModelExt) so that we don't
    // request something the driver rejects.
    VkPhysicalDeviceRobustness2FeaturesEXT robustness2{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_ROBUSTNESS_2_FEATURES_EXT,
        .nullDescriptor = VK_TRUE,
    };
    void* featureChainHead = nullptr;

    // Branch A: full Vulkan 1.3 device — use the consolidated promoted structs.
    VkPhysicalDeviceVulkan13Features features13{};
    VkPhysicalDeviceVulkan12Features features12{};

    // Branch B: pre-1.3 device — use extension-specific feature structs that
    // are valid back to Vulkan 1.1 and gated by VK_KHR_synchronization2 /
    // VK_KHR_timeline_semaphore / VK_KHR_vulkan_memory_model / VK_KHR_shader_float16_int8.
    VkPhysicalDeviceSynchronization2FeaturesKHR sync2Feat{};
    VkPhysicalDeviceTimelineSemaphoreFeaturesKHR timelineSemFeat{};
    VkPhysicalDeviceVulkanMemoryModelFeaturesKHR memModelFeat{};
    VkPhysicalDeviceShaderFloat16Int8Features fp16Feat{};

    if (api13) {
        // Every field below MUST be probed before being requested. Mali drivers
        // (G57/G68/G77 etc.) routinely return success from vkCreateDevice when
        // an unsupported optional feature is requested, then fail with
        // VK_ERROR_DEVICE_LOST on the first compute dispatch — there is no
        // earlier signal that the request was bogus. The Mali-G57 field log
        // for this fix shows exactly that pattern: vkCreateDevice OK, init OK,
        // first presentContext → DEVICE_LOST. The culprit was the unconditional
        // vulkanMemoryModel = VK_TRUE; the device does not advertise it but
        // the driver took the request anyway.
        features13 = VkPhysicalDeviceVulkan13Features{
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES,
            .pNext = hasRobustness2 ? &robustness2 : nullptr,
            .synchronization2 = hasSync2Core ? VK_TRUE : VK_FALSE,
        };
        features12 = VkPhysicalDeviceVulkan12Features{
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES,
            .pNext = &features13,
            .shaderFloat16 = hasFloat16 ? VK_TRUE : VK_FALSE,
            .timelineSemaphore = hasTimelineSemCore ? VK_TRUE : VK_FALSE,
            .vulkanMemoryModel = hasVulkanMemoryModelCore ? VK_TRUE : VK_FALSE,
        };
        featureChainHead = &features12;
    } else {
        // Walk the chain bottom-up so we can stitch pNext links cleanly.
        // The KHR feature struct sTypes are aliased to the corresponding
        // promoted core sTypes on 1.2/1.3 drivers, so it's safe to chain
        // them whether the feature comes from an extension or core.
        void* next = hasRobustness2 ? static_cast<void*>(&robustness2) : nullptr;

        // sync2 feature is only chained when the extension is enabled. On
        // legacy devices without sync2 we route every barrier through the
        // Utils::cmdPipelineBarrier2 compat shim and don't need this struct.
        if (hasSync2Ext) {
            sync2Feat = VkPhysicalDeviceSynchronization2FeaturesKHR{
                .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SYNCHRONIZATION_2_FEATURES_KHR,
                .pNext = next,
                .synchronization2 = VK_TRUE,
            };
            next = &sync2Feat;
        }

        // Timeline semaphores: core in 1.2. On 1.1 it's an extension we've
        // already added to enabledExtensions. Either way it's safe to chain
        // this struct — the sType is the same as the core 1.2 alias.
        timelineSemFeat = VkPhysicalDeviceTimelineSemaphoreFeaturesKHR{
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_TIMELINE_SEMAPHORE_FEATURES_KHR,
            .pNext = next,
            .timelineSemaphore = VK_TRUE,
        };
        next = &timelineSemFeat;

        // vulkanMemoryModel: core in 1.2 (optional even there). On 1.1 it
        // requires VK_KHR_vulkan_memory_model. Required only by the DXBC path
        // (the FP16 SPIR-V blobs from Lossless.dll use Logical GLSL450 with no
        // VMM capability — verified in _analysis/*.dis). So on devices that
        // don't support it we still create the device (just without the
        // feature enabled) and let the user pick the FP16 path; if they pick
        // DXBC the dispatch will DEVICE_LOST and the auto-disable in the
        // render loop kicks in.
        const bool memModelOk = api12
            ? hasVulkanMemoryModelCore
            : hasVulkanMemoryModelExt;
        if (memModelOk) {
            memModelFeat = VkPhysicalDeviceVulkanMemoryModelFeaturesKHR{
                .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_MEMORY_MODEL_FEATURES_KHR,
                .pNext = next,
                .vulkanMemoryModel = VK_TRUE,
            };
            next = &memModelFeat;
        }
        if (hasFloat16) {
            // The structure type alias is the same as the core 1.2 struct.
            fp16Feat = VkPhysicalDeviceShaderFloat16Int8Features{
                .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SHADER_FLOAT16_INT8_FEATURES,
                .pNext = next,
                .shaderFloat16 = VK_TRUE,
            };
            next = &fp16Feat;
        }
        featureChainHead = next;
    }
    LSFG_FRAMEGEN_LOGI(
        "Device path: apiVersion=%u.%u sync2=%s timeline_via_ext=%d "
        "memModel_via_ext=%d fp16_via_ext=%d robustness2=%d",
        VK_VERSION_MAJOR(apiVersion), VK_VERSION_MINOR(apiVersion),
        api13 ? "core1.3" : (hasSync2Ext ? "ext" : "compat-shim"),
        (int)(!api12 && hasTimelineSemExt),
        (int)(!api12 && hasVulkanMemoryModelExt),
        (int)(!api12 && hasFloat16ExtName),
        (int)hasRobustness2);

    // Use VkPhysicalDeviceFeatures2 in pNext (mutually exclusive with
    // pEnabledFeatures per spec) so we can chain the core features alongside
    // the 1.2/1.3/robustness2 structs above.
    VkPhysicalDeviceFeatures2 enabledFeatures2{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2,
        .pNext = featureChainHead,
        .features = enabledCoreFeatures,
    };
    const VkDeviceQueueCreateInfo computeQueueDesc{
        .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
        .queueFamilyIndex = *computeFamilyIdx,
        .queueCount = 1,
        .pQueuePriorities = &queuePriority
    };
    const VkDeviceCreateInfo deviceCreateInfo{
        .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
        .pNext = &enabledFeatures2,
        .queueCreateInfoCount = 1,
        .pQueueCreateInfos = &computeQueueDesc,
        .enabledExtensionCount = static_cast<uint32_t>(enabledExtensions.size()),
        .ppEnabledExtensionNames = enabledExtensions.data()
        // pEnabledFeatures intentionally NULL: enabledFeatures2 carries them
        // via pNext (the spec forbids both being non-null).
    };
    VkDevice deviceHandle{};
    res = vkCreateDevice(*physicalDevice, &deviceCreateInfo, nullptr, &deviceHandle);
    if (res != VK_SUCCESS || deviceHandle == VK_NULL_HANDLE)
        throw LSFG::vulkan_error(res, "Failed to create logical device");

    volkLoadDevice(deviceHandle);

    // Wire up the global vkCmdPipelineBarrier2 symbol so the BarrierBuilder
    // / external-barrier paths can call through it. Three cases:
    //
    //   1. Vulkan 1.3 device: volk already loaded the core entry point.
    //      Nothing to do.
    //
    //   2. Pre-1.3 device with VK_KHR_synchronization2 enabled: volk loaded
    //      vkCmdPipelineBarrier2KHR but NOT vkCmdPipelineBarrier2. They map
    //      to the same dispatch slot in the ICD, so we alias the global so
    //      callers can use the unsuffixed symbol uniformly.
    //
    //   3. Pre-1.3 device WITHOUT sync2 in any form (e.g. Mali-G57 MC2 with
    //      API 1.1.177): leave the global as NULL. Every framegen call site
    //      now goes through Utils::cmdPipelineBarrier2, which detects this
    //      case and translates VkDependencyInfo into the legacy sync1
    //      vkCmdPipelineBarrier signature on the fly. Framegen still runs
    //      end-to-end on these devices, just without the sync2 fast-path.
    if (sync2FeatureEnabled) {
        if (!api13 && vkCmdPipelineBarrier2 == nullptr &&
                vkCmdPipelineBarrier2KHR != nullptr) {
            vkCmdPipelineBarrier2 = reinterpret_cast<PFN_vkCmdPipelineBarrier2>(
                vkCmdPipelineBarrier2KHR);
            LSFG_FRAMEGEN_LOGI(
                "Aliased vkCmdPipelineBarrier2 -> vkCmdPipelineBarrier2KHR "
                "(pre-1.3 device, sync2 via extension)");
        } else if (vkCmdPipelineBarrier2 == nullptr) {
            LSFG_FRAMEGEN_LOGI(
                "vkCmdPipelineBarrier2 unavailable even though sync2 is enabled; "
                "BarrierBuilder will use the sync1 compat path");
        }
    } else {
        // Do not use the core vkCmdPipelineBarrier2 symbol on devices that
        // report the synchronization2 feature as disabled. Some 1.3 drivers
        // still expose the symbol through volk, but the feature gate is the
        // actual contract and calling the command in that state can produce
        // undefined output. Force the compat shim instead.
        vkCmdPipelineBarrier2 = nullptr;
        LSFG_FRAMEGEN_LOGI(
            "sync2 feature disabled; forcing BarrierBuilder to use the sync1 compat path");
    }

    // get compute queue
    VkQueue queueHandle{};
    vkGetDeviceQueue(deviceHandle, *computeFamilyIdx, 0, &queueHandle);

    // store in shared ptr
    this->computeQueue = queueHandle;
    this->computeFamilyIdx = *computeFamilyIdx;
    this->physicalDevice = *physicalDevice;
    this->nullDescriptorSupported = hasRobustness2;
    this->device = std::shared_ptr<VkDevice>(
        new VkDevice(deviceHandle),
        [](VkDevice* device) {
            vkDestroyDevice(*device, nullptr);
        }
    );
    if (!this->nullDescriptorSupported) {
        this->fallbackDescriptorImage = std::make_shared<Core::Image>(*this,
            VkExtent2D{1, 1}, VK_FORMAT_R8G8B8A8_UNORM,
            VK_IMAGE_USAGE_SAMPLED_BIT | VK_IMAGE_USAGE_STORAGE_BIT);
    }
}
