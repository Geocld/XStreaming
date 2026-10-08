// Minimal Vulkan smoke test for the cached SPIR-V blobs.
//
// Phase 4 only validates that every shader the DXBC→SPIR-V translator produced
// is accepted by the device driver via vkCreateShaderModule. That is a
// surprisingly powerful end-to-end check — it catches bad headers, invalid
// magic numbers, unsupported decorations, and any Vulkan version mismatch
// between how the shader was translated and what the device actually speaks.
//
// Full pipeline creation (create/present/delete context) lives in later
// phases, once we also have MediaProjection-sourced VkImages to feed it.

#include "android_shader_loader.hpp"
#include "android_vk_probe.hpp"

#include <volk.h>

#include <android/log.h>

#include <array>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "crash_reporter.hpp"

#define LOG_TAG "lsfg-vk-probe"
#define LOGE(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_ERROR, __VA_ARGS__)
#define LOGI(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_INFO,  __VA_ARGS__)

namespace lsfg_android {

namespace {

constexpr uint32_t kAllResourceIds[] = {
    255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266,
    267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279,
    280, 281, 282, 283, 284, 285, 286, 287, 288, 289,
    290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302,
};

struct VulkanState {
    VkInstance instance = VK_NULL_HANDLE;
    VkPhysicalDevice physicalDevice = VK_NULL_HANDLE;
    VkDevice device = VK_NULL_HANDLE;
};

bool create_instance_and_device(VulkanState &out) {
    if (volkInitialize() != VK_SUCCESS) {
        LOGE("volkInitialize failed — no Vulkan loader on this device?");
        return false;
    }

    const VkApplicationInfo appInfo{
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "lsfg-android",
        .applicationVersion = VK_MAKE_VERSION(0, 1, 0),
        .pEngineName = "lsfg-vk",
        .engineVersion = VK_MAKE_VERSION(1, 0, 0),
        .apiVersion = VK_API_VERSION_1_1,
    };

    const VkInstanceCreateInfo instInfo{
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &appInfo,
    };

    if (vkCreateInstance(&instInfo, nullptr, &out.instance) != VK_SUCCESS) {
        LOGE("vkCreateInstance failed");
        return false;
    }
    volkLoadInstance(out.instance);

    uint32_t count = 0;
    vkEnumeratePhysicalDevices(out.instance, &count, nullptr);
    if (count == 0) {
        LOGE("No Vulkan physical devices");
        return false;
    }
    std::vector<VkPhysicalDevice> phys(count);
    vkEnumeratePhysicalDevices(out.instance, &count, phys.data());
    out.physicalDevice = phys[0];

    VkPhysicalDeviceProperties props{};
    vkGetPhysicalDeviceProperties(out.physicalDevice, &props);
    LOGI("Using GPU: %s (API %u.%u.%u)",
         props.deviceName,
         VK_VERSION_MAJOR(props.apiVersion),
         VK_VERSION_MINOR(props.apiVersion),
         VK_VERSION_PATCH(props.apiVersion));

    uint32_t qCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(out.physicalDevice, &qCount, nullptr);
    std::vector<VkQueueFamilyProperties> qFams(qCount);
    vkGetPhysicalDeviceQueueFamilyProperties(out.physicalDevice, &qCount, qFams.data());

    uint32_t computeFamily = UINT32_MAX;
    for (uint32_t i = 0; i < qCount; ++i) {
        if (qFams[i].queueFlags & VK_QUEUE_COMPUTE_BIT) {
            computeFamily = i;
            break;
        }
    }
    if (computeFamily == UINT32_MAX) {
        LOGE("No compute-capable queue family");
        return false;
    }

    const float prio = 1.0f;
    const VkDeviceQueueCreateInfo qInfo{
        .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
        .queueFamilyIndex = computeFamily,
        .queueCount = 1,
        .pQueuePriorities = &prio,
    };
    const VkDeviceCreateInfo devInfo{
        .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
        .queueCreateInfoCount = 1,
        .pQueueCreateInfos = &qInfo,
    };
    if (vkCreateDevice(out.physicalDevice, &devInfo, nullptr, &out.device) != VK_SUCCESS) {
        LOGE("vkCreateDevice failed");
        return false;
    }
    volkLoadDevice(out.device);
    return true;
}

void destroy(VulkanState &s) {
    if (s.device) {
        vkDestroyDevice(s.device, nullptr);
        s.device = VK_NULL_HANDLE;
    }
    if (s.instance) {
        vkDestroyInstance(s.instance, nullptr);
        s.instance = VK_NULL_HANDLE;
    }
}

} // namespace

int probe_shaders_on_device(const std::string &cacheDir) {
    VulkanState vk{};
    if (!create_instance_and_device(vk)) {
        destroy(vk);
        return kProbeNoVulkan;
    }

    int loaded = 0;
    int rejected = 0;
    for (uint32_t id : kAllResourceIds) {
        auto spirv = load_cached_spirv(cacheDir, id);
        if (spirv.empty() || (spirv.size() % 4) != 0) {
            LOGE("SPIR-V resource %u missing or malformed (%zu bytes)", id, spirv.size());
            destroy(vk);
            return kProbeMissingSpirv;
        }

        const VkShaderModuleCreateInfo info{
            .sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
            .codeSize = spirv.size(),
            .pCode = reinterpret_cast<const uint32_t *>(spirv.data()),
        };
        VkShaderModule mod = VK_NULL_HANDLE;
        const VkResult r = vkCreateShaderModule(vk.device, &info, nullptr, &mod);
        if (r != VK_SUCCESS) {
            LOGE("vkCreateShaderModule rejected shader %u (VkResult=%d)", id, r);
            ++rejected;
        } else {
            vkDestroyShaderModule(vk.device, mod, nullptr);
            ++loaded;
        }
    }

    destroy(vk);

    LOGI("Probe complete: %d accepted, %d rejected", loaded, rejected);
    return rejected == 0 ? kOk : kProbeDriverRejected;
}

bool device_supports_float16() {
    // Minimal headless instance just to query a physical-device feature. We
    // intentionally do NOT request the FP16 device extension during creation
    // because we want a yes/no answer for the UI, not a working device. A
    // separate VkInstance is fine — the cost is one volkInitialize and one
    // vkEnumeratePhysicalDevices, both well under a frame.
    if (volkInitialize() != VK_SUCCESS) {
        return false;
    }
    const VkApplicationInfo appInfo{
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "lsfg-android",
        .applicationVersion = VK_MAKE_VERSION(0, 1, 0),
        .pEngineName = "lsfg-vk",
        .engineVersion = VK_MAKE_VERSION(1, 0, 0),
        .apiVersion = VK_API_VERSION_1_1,
    };
    const VkInstanceCreateInfo instInfo{
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &appInfo,
    };
    VkInstance instance = VK_NULL_HANDLE;
    if (vkCreateInstance(&instInfo, nullptr, &instance) != VK_SUCCESS) {
        return false;
    }
    volkLoadInstance(instance);

    uint32_t count = 0;
    vkEnumeratePhysicalDevices(instance, &count, nullptr);
    if (count == 0) {
        vkDestroyInstance(instance, nullptr);
        return false;
    }
    std::vector<VkPhysicalDevice> phys(count);
    vkEnumeratePhysicalDevices(instance, &count, phys.data());

    bool ok = false;
    VkPhysicalDeviceShaderFloat16Int8Features fp16{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SHADER_FLOAT16_INT8_FEATURES,
    };
    VkPhysicalDeviceFeatures2 feats2{
        .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2,
        .pNext = &fp16,
    };
    // Walk every physical device — the FP16 toggle should be available if ANY
    // of the device's GPUs supports it (the framegen session picks the first
    // compute-capable one in the same order in create_instance_and_device).
    for (auto pd : phys) {
        fp16.shaderFloat16 = VK_FALSE;
        fp16.shaderInt8 = VK_FALSE;
        vkGetPhysicalDeviceFeatures2(pd, &feats2);
        if (fp16.shaderFloat16 == VK_TRUE) {
            ok = true;
            break;
        }
    }
    vkDestroyInstance(instance, nullptr);
    return ok;
}

bool device_supports_vulkan_memory_model() {
    // VulkanMemoryModel is core-promoted in 1.2 (queryable via
    // VkPhysicalDeviceVulkan12Features); on 1.1 it's gated by
    // VK_KHR_vulkan_memory_model. We accept either signal — both gate the same
    // OpCapability VulkanMemoryModel that the bundled DXBC translator emits.
    if (volkInitialize() != VK_SUCCESS) {
        return false;
    }
    const VkApplicationInfo appInfo{
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "lsfg-android",
        .applicationVersion = VK_MAKE_VERSION(0, 1, 0),
        .pEngineName = "lsfg-vk",
        .engineVersion = VK_MAKE_VERSION(1, 0, 0),
        .apiVersion = VK_API_VERSION_1_2,
    };
    const VkInstanceCreateInfo instInfo{
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &appInfo,
    };
    VkInstance instance = VK_NULL_HANDLE;
    if (vkCreateInstance(&instInfo, nullptr, &instance) != VK_SUCCESS) {
        return false;
    }
    volkLoadInstance(instance);

    uint32_t count = 0;
    vkEnumeratePhysicalDevices(instance, &count, nullptr);
    if (count == 0) {
        vkDestroyInstance(instance, nullptr);
        return false;
    }
    std::vector<VkPhysicalDevice> phys(count);
    vkEnumeratePhysicalDevices(instance, &count, phys.data());

    bool ok = false;
    for (auto pd : phys) {
        VkPhysicalDeviceProperties props{};
        vkGetPhysicalDeviceProperties(pd, &props);
        const bool api12 = props.apiVersion >= VK_API_VERSION_1_2;
        if (api12) {
            VkPhysicalDeviceVulkan12Features vk12{
                .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES,
            };
            VkPhysicalDeviceFeatures2 feats2{
                .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2,
                .pNext = &vk12,
            };
            vkGetPhysicalDeviceFeatures2(pd, &feats2);
            if (vk12.vulkanMemoryModel == VK_TRUE) {
                ok = true;
                break;
            }
        } else {
            // Pre-1.2: VK_KHR_vulkan_memory_model presence is the gating signal.
            uint32_t extCount = 0;
            vkEnumerateDeviceExtensionProperties(pd, nullptr, &extCount, nullptr);
            std::vector<VkExtensionProperties> exts(extCount);
            vkEnumerateDeviceExtensionProperties(pd, nullptr, &extCount, exts.data());
            for (const auto &e : exts) {
                if (std::strcmp(e.extensionName,
                                VK_KHR_VULKAN_MEMORY_MODEL_EXTENSION_NAME) == 0) {
                    ok = true;
                    break;
                }
            }
            if (ok) break;
        }
    }
    vkDestroyInstance(instance, nullptr);
    return ok;
}

} // namespace lsfg_android
