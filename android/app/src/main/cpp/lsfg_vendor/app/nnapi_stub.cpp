#include "nnapi_npu.hpp"
#include "nnapi_postprocess.hpp"

namespace lsfg_android {

bool nnapi_has_npu_accelerator() {
    return false;
}

std::vector<ANeuralNetworksDevice *> nnapi_npu_accelerator_devices() {
    return {};
}

std::string nnapi_npu_summary() {
    return "NNAPI post-processing disabled in PeaSyo build";
}

NnapiPostProcessor::~NnapiPostProcessor() = default;

bool NnapiPostProcessor::configure(
        uint32_t /*width*/,
        uint32_t /*height*/,
        const NnapiPostProcessConfig &/*config*/) {
    return false;
}

bool NnapiPostProcessor::processRgba8888(
        const uint8_t * /*src*/,
        uint32_t /*srcStrideBytes*/,
        uint8_t * /*dst*/,
        uint32_t /*dstStrideBytes*/) {
    return false;
}

void NnapiPostProcessor::reset() {
}

} // namespace lsfg_android
