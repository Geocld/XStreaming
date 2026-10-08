#pragma once

// AHardwareBuffer <-> VkImage <-> opaque FD bridge.
//
// framegen's LSFG_3_1::createContext on Linux takes opaque file descriptors
// produced by vkGetMemoryFdKHR on host-allocated memory. Android's equivalent
// route is: allocate (or import) an AHardwareBuffer, wrap it in a VkImage via
// VK_ANDROID_external_memory_android_hardware_buffer, then export an
// OPAQUE_FD from that memory. Some drivers don't support exporting OPAQUE_FD
// from AHB-imported memory — in that case createAhbImage() will return an
// AhbImage with exportedFd == -1 and the caller must take the framegen-overload
// fallback path documented in the plan.

#include "android_vk_session.hpp"

#include <volk.h>
#include <android/hardware_buffer.h>

#include <cstdint>

namespace lsfg_android {

constexpr int kErrAhbAllocate = -30;
constexpr int kErrAhbProperties = -31;
constexpr int kErrAhbImageCreate = -32;
constexpr int kErrAhbMemoryAllocate = -33;
constexpr int kErrAhbBindMemory = -34;
constexpr int kErrAhbExportFd = -35;

struct AhbImage {
    AHardwareBuffer *ahb = nullptr;       // owned iff ownsAhb
    bool ownsAhb = false;
    VkImage image = VK_NULL_HANDLE;        // owned
    VkDeviceMemory memory = VK_NULL_HANDLE; // owned
    VkExtent2D extent{0, 0};
    VkFormat format = VK_FORMAT_UNDEFINED;
    int exportedFd = -1;                   // -1 if not exported; consumed by framegen
};

// Allocates a fresh AHardwareBuffer of (w, h, fmt) and wraps it in a VkImage.
// Tries to export an opaque FD; if the driver refuses, exportedFd stays -1
// (the AhbImage is still usable for direct VkImage operations).
//
// Format must be one of the standard AHB formats: AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM
// is the safe default for capture; other formats may need a YCbCr conversion.
//
// usage flags: GPU_SAMPLED_IMAGE | GPU_FRAMEBUFFER are set by default.
//
// Returns kOk on success; on failure returns kErrAhb* and `out` is left in
// a destroy()-safe state.
int createAhbImage(VulkanSession &vk, uint32_t w, uint32_t h,
                   VkFormat fmt, AhbImage &out);

// Imports an EXTERNAL AHardwareBuffer (e.g. one acquired from ImageReader).
// Does NOT take ownership of the AHB. The caller must keep it alive (via
// AHardwareBuffer_acquire) for as long as `out` is in use.
//
// Note: imported AHBs are typically NOT exportable as OPAQUE_FD even when
// the driver supports the export path for self-allocated memory. Use this
// when feeding ImageReader frames into Vulkan-side copies, not for handing
// FDs to framegen.
int importAhbImage(VulkanSession &vk, AHardwareBuffer *ahb, AhbImage &out);

// Releases everything. Safe to call on a partially-initialized AhbImage.
void destroyAhbImage(VulkanSession &vk, AhbImage &img);

} // namespace lsfg_android
