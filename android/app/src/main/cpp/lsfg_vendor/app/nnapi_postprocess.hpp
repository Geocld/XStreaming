#pragma once

#include <android/NeuralNetworks.h>

#include <cstdint>
#include <vector>

namespace lsfg_android {

// NPU-only post-processing. Every enhancement mode is a handcrafted NNAPI
// graph compiled for a dedicated accelerator device. There is no CPU fallback
// for enhance: if the NPU is not available the processor reports not-ready
// and the render loop skips it entirely. CPU-side pixel work lives in
// cpu_postprocess.cpp under the "CPU post-process" user category.

enum class NpuPreset : int {
    OFF          = 0,
    SHARPEN      = 1,
    DETAIL_BOOST = 2,
    CHROMA_CLEAN = 3,
    GAME_CRISP   = 4,
};

struct NnapiPostProcessConfig {
    NpuPreset preset = NpuPreset::OFF;
    int upscaleFactor = 1;   // 1 or 2
    float amount = 0.5f;     // 0..1 — strength of the enhancement kernel
    float radius = 1.0f;     // 0.5..2.0 — blur radius for unsharp-mask paths
    float threshold = 0.0f;  // 0..1 — minimum edge magnitude to boost (reserved)
    bool fp16 = true;
};

class NnapiPostProcessor {
public:
    ~NnapiPostProcessor();

    bool configure(uint32_t width, uint32_t height,
                   const NnapiPostProcessConfig &config);

    bool processRgba8888(const uint8_t *src, uint32_t srcStrideBytes,
                         uint8_t *dst, uint32_t dstStrideBytes);

    void reset();

    uint32_t outputWidth() const { return outW; }
    uint32_t outputHeight() const { return outH; }
    bool ready() const { return compilation != nullptr; }

private:
    // Model-building context. Keeps operand indices flowing and owns all
    // backing storage for constant operands (NNAPI requires their memory to
    // outlive the compilation).
    struct Builder {
        ANeuralNetworksModel *m = nullptr;
        int next = 0;
        std::vector<std::vector<uint8_t>>  constU8;
        std::vector<std::vector<int32_t>>  constI32;
        std::vector<uint8_t>               scalarBool;
        std::vector<int32_t>               scalarInt;

        int addOperand(int32_t type, const uint32_t *dims, uint32_t dimCount,
                       float scale, int32_t zeroPoint);
        int addConstQuant8(const uint32_t *dims, uint32_t dimCount,
                           std::vector<uint8_t> bytes,
                           float scale, int32_t zeroPoint);
        int addConstInt32Tensor(const uint32_t *dims, uint32_t dimCount,
                                std::vector<int32_t> values, float scale);
        int addScalarInt(int32_t v);
        int addScalarBool(bool v);
        int addActivationNone();
    };

    // Return final activation operand index, or -1 on any failure.
    int buildGraphForPreset(Builder &b, int input,
                            uint32_t w, uint32_t h,
                            const NnapiPostProcessConfig &c);
    int buildResize(Builder &b, int input, uint32_t outW, uint32_t outH);
    int buildSharpen(Builder &b, int input, uint32_t w, uint32_t h,
                     float amount, float radius);
    int buildToneCurve(Builder &b, int input, uint32_t w, uint32_t h,
                       float amount);
    int buildSaturation(Builder &b, int input, uint32_t w, uint32_t h,
                        float amount);
    int buildChromaClean(Builder &b, int input, uint32_t w, uint32_t h,
                         float amount);

    uint32_t inW = 0;
    uint32_t inH = 0;
    uint32_t outW = 0;
    uint32_t outH = 0;
    NnapiPostProcessConfig cfg{};

    // Owned model state. constants buffer lives in builderStorage so that it
    // outlives the compilation (ANeuralNetworksModel_setOperandValue captures
    // a pointer, not a copy).
    Builder builderStorage{};
    ANeuralNetworksModel *model = nullptr;
    ANeuralNetworksCompilation *compilation = nullptr;
    ANeuralNetworksBurst *burst = nullptr;
    uint8_t *inputBuf = nullptr;
    uint8_t *outputBuf = nullptr;
    uint32_t inputByteCount = 0;
    uint32_t outputByteCount = 0;
};

} // namespace lsfg_android
