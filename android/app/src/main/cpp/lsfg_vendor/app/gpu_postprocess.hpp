#pragma once

#include "ahb_image_bridge.hpp"

#include <cstdint>

namespace lsfg_android {

struct GpuPostProcessConfig {
    int method = 0;
    float sharpness = 0.5f;
    float strength = 0.5f;
};

class GpuPostProcessor {
public:
    bool process(VulkanSession &vk,
                 const AhbImage &src,
                 const AhbImage &dst,
                 const GpuPostProcessConfig &config);

    void reset(VulkanSession &vk);

private:
    bool ensurePipeline(VulkanSession &vk);

    VkDescriptorSetLayout descriptorSetLayout = VK_NULL_HANDLE;
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkPipeline pipeline = VK_NULL_HANDLE;
    VkDescriptorPool descriptorPool = VK_NULL_HANDLE;
    VkDescriptorSet descriptorSet = VK_NULL_HANDLE;
};

} // namespace lsfg_android
