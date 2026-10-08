#pragma once

#include <android/NeuralNetworks.h>

#include <string>
#include <vector>

namespace lsfg_android {

bool nnapi_has_npu_accelerator();
std::vector<ANeuralNetworksDevice *> nnapi_npu_accelerator_devices();
std::string nnapi_npu_summary();

} // namespace lsfg_android
