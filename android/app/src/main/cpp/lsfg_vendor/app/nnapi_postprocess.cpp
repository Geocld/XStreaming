#include "nnapi_postprocess.hpp"
#include "nnapi_npu.hpp"
#include "crash_reporter.hpp"

#include <android/log.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <new>

#define NPU_LOG_TAG "lsfg-npu-post"
#define NPU_LOGI(...) ::lsfg_android::ring_logf(NPU_LOG_TAG, ANDROID_LOG_INFO,  __VA_ARGS__)
#define NPU_LOGW(...) ::lsfg_android::ring_logf(NPU_LOG_TAG, ANDROID_LOG_WARN,  __VA_ARGS__)
#define NPU_LOGE(...) ::lsfg_android::ring_logf(NPU_LOG_TAG, ANDROID_LOG_ERROR, __VA_ARGS__)

// NPU-only image enhancement. Each preset assembles a small NNAPI graph that
// runs entirely on a dedicated accelerator (HTP / APU / Eden / Ethos / ANE).
// No CPU fallback: if compilation on the dedicated device fails, configure()
// returns false and the render loop disables the stage. CPU-side filters live
// in cpu_postprocess.cpp under the separate user-facing "CPU post-process".
//
// Quantization convention:
//
//   activations     QUANT8_ASYMM   scale = 1/255    zeroPoint = 0
//   signed weights  QUANT8_ASYMM   scale = 1/128    zeroPoint = 128
//       -> stored byte b represents (b - 128) / 128 in [-1, ~1].
//   conv biases     INT32          scale = act_scale * weight_scale
//                                        = 1 / (255 * 128)
//
// Filter layouts use the NNAPI defaults:
//   CONV_2D        [outC, kH, kW, inC]
//   DEPTHWISE_2D   [1, kH, kW, C]  with depth_multiplier = 1

namespace lsfg_android {

namespace {

constexpr int kOk = ANEURALNETWORKS_NO_ERROR;
constexpr float kActScale = 1.0f / 255.0f;
// Weight scale picked so the representable range comfortably includes the
// largest weight the enhance kernels generate. The sharpen preset uses a
// center tap of (1 + amount), up to 2.0 at full amount. With scale 1/64 and
// zeroPoint 128, a byte b maps to (b - 128) / 64 in [-2.0, 127/64 ≈ 1.98];
// we cap the center at 1.98 which is still visually identical to 2.0.
//
// Previously scale was 1/128 which capped the representable weight at
// 127/128 ≈ 0.99 — that silently neutered the unsharp center tap (1.0 ->
// 0.99 quantized), making the sharpen and game-crisp presets look like
// pass-through plus a tiny blur. That was the "NPU does nothing" symptom.
constexpr float kWeightScale = 1.0f / 64.0f;
constexpr int32_t kWeightZero = 128;

uint8_t quantize_weight(float v) {
    const float q = std::lround(v * 64.0f + 128.0f);
    return static_cast<uint8_t>(std::max(0.0f, std::min(255.0f, q)));
}

int32_t quantize_bias(float v) {
    // bias_scale = act_scale * weight_scale = 1 / (255 * 64)
    const double q = std::lround(static_cast<double>(v) * 255.0 * 64.0);
    if (q > 2147483647.0) return 2147483647;
    if (q < -2147483648.0) return -2147483648;
    return static_cast<int32_t>(q);
}

} // namespace

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

int NnapiPostProcessor::Builder::addOperand(int32_t type, const uint32_t *dims,
                                            uint32_t dimCount,
                                            float scale, int32_t zeroPoint) {
    ANeuralNetworksOperandType op{
        .type = type,
        .dimensionCount = dimCount,
        .dimensions = dims,
        .scale = scale,
        .zeroPoint = zeroPoint,
    };
    if (ANeuralNetworksModel_addOperand(m, &op) != kOk) return -1;
    return next++;
}

int NnapiPostProcessor::Builder::addConstQuant8(const uint32_t *dims,
                                                uint32_t dimCount,
                                                std::vector<uint8_t> bytes,
                                                float scale, int32_t zeroPoint) {
    const int idx = addOperand(ANEURALNETWORKS_TENSOR_QUANT8_ASYMM,
                               dims, dimCount, scale, zeroPoint);
    if (idx < 0) return -1;
    constU8.emplace_back(std::move(bytes));
    const auto &stored = constU8.back();
    if (ANeuralNetworksModel_setOperandValue(m, idx,
            stored.data(), stored.size()) != kOk) {
        return -1;
    }
    return idx;
}

int NnapiPostProcessor::Builder::addConstInt32Tensor(const uint32_t *dims,
                                                     uint32_t dimCount,
                                                     std::vector<int32_t> values,
                                                     float scale) {
    const int idx = addOperand(ANEURALNETWORKS_TENSOR_INT32,
                               dims, dimCount, scale, 0);
    if (idx < 0) return -1;
    constI32.emplace_back(std::move(values));
    const auto &stored = constI32.back();
    if (ANeuralNetworksModel_setOperandValue(m, idx,
            stored.data(),
            stored.size() * sizeof(int32_t)) != kOk) {
        return -1;
    }
    return idx;
}

int NnapiPostProcessor::Builder::addScalarInt(int32_t v) {
    const int idx = addOperand(ANEURALNETWORKS_INT32, nullptr, 0, 0.0f, 0);
    if (idx < 0) return -1;
    scalarInt.push_back(v);
    const int32_t &stored = scalarInt.back();
    if (ANeuralNetworksModel_setOperandValue(m, idx,
            &stored, sizeof(stored)) != kOk) {
        return -1;
    }
    return idx;
}

int NnapiPostProcessor::Builder::addScalarBool(bool v) {
    const int idx = addOperand(ANEURALNETWORKS_BOOL, nullptr, 0, 0.0f, 0);
    if (idx < 0) return -1;
    scalarBool.push_back(v ? 1 : 0);
    const uint8_t &stored = scalarBool.back();
    if (ANeuralNetworksModel_setOperandValue(m, idx,
            &stored, sizeof(stored)) != kOk) {
        return -1;
    }
    return idx;
}

int NnapiPostProcessor::Builder::addActivationNone() {
    return addScalarInt(0);
}

// ---------------------------------------------------------------------------
// Subgraph builders
// ---------------------------------------------------------------------------

// Pure RESIZE_BILINEAR, used for upscale mode and as the first step of a
// combined upscale+enhance graph.
//
// We use the 3-input form (the core variant supported since NNAPI feature
// level 28). The 6-input form with nchw / alignCorners / halfPixelCenters
// only works on feature level ≥ 30 and gets rejected at finish() on many
// older Hexagon / Eden stacks.
int NnapiPostProcessor::buildResize(Builder &b, int input,
                                    uint32_t tgtW, uint32_t tgtH) {
    const uint32_t outDims[4] = {1, tgtH, tgtW, 4};
    const int outWIdx = b.addScalarInt(static_cast<int32_t>(tgtW));
    const int outHIdx = b.addScalarInt(static_cast<int32_t>(tgtH));
    const int outIdx = b.addOperand(ANEURALNETWORKS_TENSOR_QUANT8_ASYMM,
                                    outDims, 4, kActScale, 0);
    if (outWIdx < 0 || outHIdx < 0 || outIdx < 0) {
        return -1;
    }
    const uint32_t ins[3] = {
        static_cast<uint32_t>(input),
        static_cast<uint32_t>(outWIdx),
        static_cast<uint32_t>(outHIdx),
    };
    const uint32_t outs[1] = { static_cast<uint32_t>(outIdx) };
    if (ANeuralNetworksModel_addOperation(b.m,
            ANEURALNETWORKS_RESIZE_BILINEAR, 3, ins, 1, outs) != kOk) {
        return -1;
    }
    return outIdx;
}

// Build a single depthwise 3x3 kernel that implements unsharp-mask:
//
//     out = original + amount * (original - blur(original))
//         = (1 + amount) * original - amount * blur(original)
//
// In a 3x3 depthwise form the kernel is:
//
//     k[center] = 1 + amount - amount * blur_center
//     k[other]  =             - amount * blur_other
//
// with blur weights from a normalized Gaussian whose radius is controlled by
// `radius` (mapped to sigma in [0.4, 1.6]).
//
// Everything fits in [-1, ~1.5] so the 1/128 weight scale is large enough.
int NnapiPostProcessor::buildSharpen(Builder &b, int input,
                                     uint32_t w, uint32_t h,
                                     float amount, float radius) {
    const float sigma = std::max(0.4f, std::min(1.6f, 0.4f + radius));
    const float tw = 1.0f / (sigma * std::sqrt(2.0f));
    float blur[9];
    float sum = 0.0f;
    for (int dy = -1; dy <= 1; ++dy) {
        for (int dx = -1; dx <= 1; ++dx) {
            const float g = std::exp(-(dx * dx + dy * dy) * tw * tw);
            blur[(dy + 1) * 3 + (dx + 1)] = g;
            sum += g;
        }
    }
    for (float &f : blur) f /= sum;

    // Combined unsharp kernel. Clamp amount to keep us inside [-1, 1.5].
    const float a = std::max(0.0f, std::min(1.0f, amount));
    float k[9];
    for (int i = 0; i < 9; ++i) {
        k[i] = -a * blur[i];
    }
    k[4] += (1.0f + a); // center bump

    // Depthwise filter layout: [1, 3, 3, 4]. Same sharpen kernel on RGB;
    // alpha uses an identity kernel (center=1, borders=0) so zero-padded
    // image edges don't bleed semi-transparency into the output.
    const uint32_t filterDims[4] = {1, 3, 3, 4};
    std::vector<uint8_t> filterBytes(1 * 3 * 3 * 4);
    for (int r = 0; r < 3; ++r) {
        for (int c = 0; c < 3; ++c) {
            const int idx = r * 3 + c;
            const float identV = (r == 1 && c == 1) ? 1.0f : 0.0f;
            filterBytes[idx * 4 + 0] = quantize_weight(k[idx]);
            filterBytes[idx * 4 + 1] = quantize_weight(k[idx]);
            filterBytes[idx * 4 + 2] = quantize_weight(k[idx]);
            filterBytes[idx * 4 + 3] = quantize_weight(identV);
        }
    }

    // Per-channel bias (INT32, scale = act*weight). All zero — the kernel
    // already carries the DC through the identity center.
    const uint32_t biasDims[1] = {4};
    std::vector<int32_t> biasValues(4, 0);

    // Build operands: filter, bias, padding, stride, act, depth multiplier.
    const int filterIdx = b.addConstQuant8(filterDims, 4, std::move(filterBytes),
                                           kWeightScale, kWeightZero);
    const int biasIdx = b.addConstInt32Tensor(biasDims, 1, std::move(biasValues),
                                              kActScale * kWeightScale);

    const int paddingIdx = b.addScalarInt(1);   // SAME
    const int strideWIdx = b.addScalarInt(1);
    const int strideHIdx = b.addScalarInt(1);
    const int depthMulIdx = b.addScalarInt(1);
    const int actIdx = b.addActivationNone();

    const uint32_t outDims[4] = {1, h, w, 4};
    const int outIdx = b.addOperand(ANEURALNETWORKS_TENSOR_QUANT8_ASYMM,
                                    outDims, 4, kActScale, 0);
    if (filterIdx < 0 || biasIdx < 0 || paddingIdx < 0 ||
            strideWIdx < 0 || strideHIdx < 0 || depthMulIdx < 0 ||
            actIdx < 0 || outIdx < 0) {
        return -1;
    }

    const uint32_t ins[8] = {
        static_cast<uint32_t>(input),
        static_cast<uint32_t>(filterIdx),
        static_cast<uint32_t>(biasIdx),
        static_cast<uint32_t>(paddingIdx),
        static_cast<uint32_t>(strideWIdx),
        static_cast<uint32_t>(strideHIdx),
        static_cast<uint32_t>(depthMulIdx),
        static_cast<uint32_t>(actIdx),
    };
    const uint32_t outs[1] = { static_cast<uint32_t>(outIdx) };
    if (ANeuralNetworksModel_addOperation(b.m,
            ANEURALNETWORKS_DEPTHWISE_CONV_2D, 8, ins, 1, outs) != kOk) {
        return -1;
    }
    return outIdx;
}

// Build a 1x1 CONV_2D that applies a tone curve per channel. Implemented as
// a diagonal 4x4 weight matrix with per-channel gain computed from a gamma
// curve controlled by amount. amount=0 means identity gain (1.0), amount=1
// means ~1.15 contrast boost on RGB plus alpha untouched.
int NnapiPostProcessor::buildToneCurve(Builder &b, int input,
                                       uint32_t w, uint32_t h,
                                       float amount) {
    const float a = std::max(0.0f, std::min(1.0f, amount));
    const float gain = 1.0f + 0.15f * a;   // RGB contrast boost
    const float bias = -0.5f * (gain - 1.0f); // bring midpoint back toward 0.5

    // [outC=4, kH=1, kW=1, inC=4] diagonal.
    const uint32_t fDims[4] = {4, 1, 1, 4};
    std::vector<uint8_t> fBytes(4 * 1 * 1 * 4, quantize_weight(0.0f));
    // diagonal[ch][ch] = gain (or 1.0 for alpha)
    for (int oc = 0; oc < 3; ++oc) {
        fBytes[oc * 4 + oc] = quantize_weight(gain);
    }
    fBytes[3 * 4 + 3] = quantize_weight(1.0f);

    const uint32_t biasDims[1] = {4};
    std::vector<int32_t> biasValues(4, 0);
    for (int i = 0; i < 3; ++i) biasValues[i] = quantize_bias(bias);

    const int fIdx = b.addConstQuant8(fDims, 4, std::move(fBytes),
                                      kWeightScale, kWeightZero);
    const int biasIdx = b.addConstInt32Tensor(biasDims, 1, std::move(biasValues),
                                              kActScale * kWeightScale);

    const int paddingIdx = b.addScalarInt(1);
    const int strideWIdx = b.addScalarInt(1);
    const int strideHIdx = b.addScalarInt(1);
    const int actIdx = b.addActivationNone();

    const uint32_t outDims[4] = {1, h, w, 4};
    const int outIdx = b.addOperand(ANEURALNETWORKS_TENSOR_QUANT8_ASYMM,
                                    outDims, 4, kActScale, 0);
    if (fIdx < 0 || biasIdx < 0 || paddingIdx < 0 ||
            strideWIdx < 0 || strideHIdx < 0 || actIdx < 0 || outIdx < 0) {
        return -1;
    }

    const uint32_t ins[7] = {
        static_cast<uint32_t>(input),
        static_cast<uint32_t>(fIdx),
        static_cast<uint32_t>(biasIdx),
        static_cast<uint32_t>(paddingIdx),
        static_cast<uint32_t>(strideWIdx),
        static_cast<uint32_t>(strideHIdx),
        static_cast<uint32_t>(actIdx),
    };
    const uint32_t outs[1] = { static_cast<uint32_t>(outIdx) };
    if (ANeuralNetworksModel_addOperation(b.m,
            ANEURALNETWORKS_CONV_2D, 7, ins, 1, outs) != kOk) {
        return -1;
    }
    return outIdx;
}

// Build a saturation tweak as a 1x1 CONV_2D that pushes RGB slightly away
// from the Y-line. We use the approximation:
//   Y  = 0.299*R + 0.587*G + 0.114*B
//   R' = Y + s * (R - Y) = (1+(s-1)*0.701) R + (s-1)*(-0.587) G + ...
// amount=1 means s=1.2 (vivid), amount=0 means s=1.0 (identity).
int NnapiPostProcessor::buildSaturation(Builder &b, int input,
                                        uint32_t w, uint32_t h,
                                        float amount) {
    const float a = std::max(0.0f, std::min(1.0f, amount));
    const float s = 1.0f + 0.20f * a;

    const float r = 0.299f;
    const float g = 0.587f;
    const float bb = 0.114f;

    // Matrix M such that out_rgb = M * in_rgb; pad alpha pass-through.
    const float m[3][3] = {
        { s + (1 - s) * r, (1 - s) * g, (1 - s) * bb },
        { (1 - s) * r, s + (1 - s) * g, (1 - s) * bb },
        { (1 - s) * r, (1 - s) * g, s + (1 - s) * bb },
    };

    const uint32_t fDims[4] = {4, 1, 1, 4};
    std::vector<uint8_t> fBytes(4 * 1 * 1 * 4, quantize_weight(0.0f));
    for (int oc = 0; oc < 3; ++oc) {
        for (int ic = 0; ic < 3; ++ic) {
            fBytes[oc * 4 + ic] = quantize_weight(m[oc][ic]);
        }
    }
    fBytes[3 * 4 + 3] = quantize_weight(1.0f);

    const uint32_t biasDims[1] = {4};
    std::vector<int32_t> biasValues(4, 0);

    const int fIdx = b.addConstQuant8(fDims, 4, std::move(fBytes),
                                      kWeightScale, kWeightZero);
    const int biasIdx = b.addConstInt32Tensor(biasDims, 1, std::move(biasValues),
                                              kActScale * kWeightScale);

    const int paddingIdx = b.addScalarInt(1);
    const int strideWIdx = b.addScalarInt(1);
    const int strideHIdx = b.addScalarInt(1);
    const int actIdx = b.addActivationNone();

    const uint32_t outDims[4] = {1, h, w, 4};
    const int outIdx = b.addOperand(ANEURALNETWORKS_TENSOR_QUANT8_ASYMM,
                                    outDims, 4, kActScale, 0);
    if (fIdx < 0 || biasIdx < 0 || paddingIdx < 0 ||
            strideWIdx < 0 || strideHIdx < 0 || actIdx < 0 || outIdx < 0) {
        return -1;
    }

    const uint32_t ins[7] = {
        static_cast<uint32_t>(input),
        static_cast<uint32_t>(fIdx),
        static_cast<uint32_t>(biasIdx),
        static_cast<uint32_t>(paddingIdx),
        static_cast<uint32_t>(strideWIdx),
        static_cast<uint32_t>(strideHIdx),
        static_cast<uint32_t>(actIdx),
    };
    const uint32_t outs[1] = { static_cast<uint32_t>(outIdx) };
    if (ANeuralNetworksModel_addOperation(b.m,
            ANEURALNETWORKS_CONV_2D, 7, ins, 1, outs) != kOk) {
        return -1;
    }
    return outIdx;
}

// Build a chroma-clean pass as a single depthwise 3x3: RGB channels get a
// mild gaussian (blends chroma noise) while alpha is identity. We take
// advantage of the fact that averaging three color channels attenuates
// luma-uncorrelated chroma noise while depthwise preserves alpha verbatim.
int NnapiPostProcessor::buildChromaClean(Builder &b, int input,
                                         uint32_t w, uint32_t h,
                                         float amount) {
    const float a = std::max(0.0f, std::min(1.0f, amount));
    const float sigma = 0.7f + a * 0.6f;
    float blur[9];
    float sum = 0.0f;
    const float tw = 1.0f / (sigma * std::sqrt(2.0f));
    for (int dy = -1; dy <= 1; ++dy) {
        for (int dx = -1; dx <= 1; ++dx) {
            const float g = std::exp(-(dx * dx + dy * dy) * tw * tw);
            blur[(dy + 1) * 3 + (dx + 1)] = g;
            sum += g;
        }
    }
    for (float &f : blur) f /= sum;

    // depthwise: RGB get the blur; alpha is identity (center 1.0, others 0).
    const uint32_t filterDims[4] = {1, 3, 3, 4};
    std::vector<uint8_t> filterBytes(1 * 3 * 3 * 4);
    for (int r = 0; r < 3; ++r) {
        for (int c = 0; c < 3; ++c) {
            const int idx = r * 3 + c;
            const float blurV = blur[idx];
            const float identV = (r == 1 && c == 1) ? 1.0f : 0.0f;
            filterBytes[(idx) * 4 + 0] = quantize_weight(blurV);
            filterBytes[(idx) * 4 + 1] = quantize_weight(blurV);
            filterBytes[(idx) * 4 + 2] = quantize_weight(blurV);
            filterBytes[(idx) * 4 + 3] = quantize_weight(identV);
        }
    }

    const uint32_t biasDims[1] = {4};
    std::vector<int32_t> biasValues(4, 0);

    const int filterIdx = b.addConstQuant8(filterDims, 4, std::move(filterBytes),
                                           kWeightScale, kWeightZero);
    const int biasIdx = b.addConstInt32Tensor(biasDims, 1, std::move(biasValues),
                                              kActScale * kWeightScale);

    const int paddingIdx = b.addScalarInt(1);
    const int strideWIdx = b.addScalarInt(1);
    const int strideHIdx = b.addScalarInt(1);
    const int depthMulIdx = b.addScalarInt(1);
    const int actIdx = b.addActivationNone();

    const uint32_t outDims[4] = {1, h, w, 4};
    const int outIdx = b.addOperand(ANEURALNETWORKS_TENSOR_QUANT8_ASYMM,
                                    outDims, 4, kActScale, 0);
    if (filterIdx < 0 || biasIdx < 0 || paddingIdx < 0 ||
            strideWIdx < 0 || strideHIdx < 0 || depthMulIdx < 0 ||
            actIdx < 0 || outIdx < 0) {
        return -1;
    }

    const uint32_t ins[8] = {
        static_cast<uint32_t>(input),
        static_cast<uint32_t>(filterIdx),
        static_cast<uint32_t>(biasIdx),
        static_cast<uint32_t>(paddingIdx),
        static_cast<uint32_t>(strideWIdx),
        static_cast<uint32_t>(strideHIdx),
        static_cast<uint32_t>(depthMulIdx),
        static_cast<uint32_t>(actIdx),
    };
    const uint32_t outs[1] = { static_cast<uint32_t>(outIdx) };
    if (ANeuralNetworksModel_addOperation(b.m,
            ANEURALNETWORKS_DEPTHWISE_CONV_2D, 8, ins, 1, outs) != kOk) {
        return -1;
    }
    return outIdx;
}

// Compose a preset. Every path starts from `input` (already at the post-
// resize size w x h) and returns the tensor that will be the model output.
int NnapiPostProcessor::buildGraphForPreset(Builder &b, int input,
                                            uint32_t w, uint32_t h,
                                            const NnapiPostProcessConfig &c) {
    switch (c.preset) {
        case NpuPreset::OFF:
            return input;
        case NpuPreset::SHARPEN:
            return buildSharpen(b, input, w, h, c.amount, c.radius);
        case NpuPreset::DETAIL_BOOST: {
            const int s = buildSharpen(b, input, w, h, c.amount * 0.85f, c.radius);
            if (s < 0) return -1;
            return buildToneCurve(b, s, w, h, c.amount);
        }
        case NpuPreset::CHROMA_CLEAN:
            return buildChromaClean(b, input, w, h, c.amount);
        case NpuPreset::GAME_CRISP: {
            const int s = buildSharpen(b, input, w, h,
                                       std::min(1.0f, c.amount * 1.2f),
                                       std::max(0.5f, c.radius * 0.75f));
            if (s < 0) return -1;
            return buildSaturation(b, s, w, h, c.amount * 0.6f);
        }
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

NnapiPostProcessor::~NnapiPostProcessor() {
    reset();
}

void NnapiPostProcessor::reset() {
    if (burst != nullptr) {
        ANeuralNetworksBurst_free(burst);
        burst = nullptr;
    }
    if (compilation != nullptr) {
        ANeuralNetworksCompilation_free(compilation);
        compilation = nullptr;
    }
    if (model != nullptr) {
        ANeuralNetworksModel_free(model);
        model = nullptr;
    }
    delete[] inputBuf;
    inputBuf = nullptr;
    delete[] outputBuf;
    outputBuf = nullptr;
    inputByteCount = 0;
    outputByteCount = 0;
    inW = inH = outW = outH = 0;
    builderStorage = Builder{};
    cfg = {};
}

bool NnapiPostProcessor::configure(uint32_t width, uint32_t height,
                                   const NnapiPostProcessConfig &config) {
    const bool wantsResize = config.upscaleFactor == 2;
    const uint32_t factor = wantsResize ? 2U : 1U;
    const uint32_t tgtW = width * factor;
    const uint32_t tgtH = height * factor;
    const bool wantsEnhance = config.preset != NpuPreset::OFF;

    // No-op reconfigure: same geometry, same preset, same fp16 pref. amount /
    // radius / threshold are graph-baked so any change forces a rebuild.
    if (ready() && inW == width && inH == height &&
            outW == tgtW && outH == tgtH &&
            cfg.preset == config.preset &&
            cfg.upscaleFactor == config.upscaleFactor &&
            std::fabs(cfg.amount - config.amount) < 0.001f &&
            std::fabs(cfg.radius - config.radius) < 0.001f &&
            std::fabs(cfg.threshold - config.threshold) < 0.001f &&
            cfg.fp16 == config.fp16) {
        return true;
    }

    reset();
    if (width == 0 || height == 0) {
        NPU_LOGW("configure: invalid size %ux%u", width, height);
        return false;
    }
    if (!wantsEnhance && !wantsResize) {
        // Nothing to do at all; configure succeeds in a no-graph state.
        NPU_LOGI("configure: preset=OFF upscale=1x; no graph to build");
        inW = width; inH = height;
        outW = width; outH = height;
        cfg = config;
        return false; // ready() stays false so render loop skips us
    }

    // Require a dedicated NPU device for any graph — including pure resize.
    // No CPU / GPU fallback here by design.
    const std::vector<ANeuralNetworksDevice *> npuDevices =
        nnapi_npu_accelerator_devices();
    if (npuDevices.empty()) {
        NPU_LOGW("configure: no dedicated NNAPI accelerator enumerated; aborting");
        reset();
        return false;
    }
    NPU_LOGI("configure: size=%ux%u preset=%d upscale=%dx amount=%.2f radius=%.2f fp16=%d devices=%zu",
             width, height, static_cast<int>(config.preset),
             config.upscaleFactor, config.amount, config.radius,
             (int)config.fp16, npuDevices.size());

    inW = width;
    inH = height;
    outW = tgtW;
    outH = tgtH;
    cfg = config;

    inputByteCount = inW * inH * 4U;
    outputByteCount = outW * outH * 4U;
    inputBuf = new (std::nothrow) uint8_t[inputByteCount];
    outputBuf = new (std::nothrow) uint8_t[outputByteCount];
    if (inputBuf == nullptr || outputBuf == nullptr) {
        reset();
        return false;
    }

    if (ANeuralNetworksModel_create(&model) != kOk || model == nullptr) {
        NPU_LOGE("configure: ANeuralNetworksModel_create failed");
        reset();
        return false;
    }

    builderStorage = Builder{};
    builderStorage.m = model;

    // Input operand.
    const uint32_t inDims[4] = {1, inH, inW, 4};
    const int inIdx = builderStorage.addOperand(
        ANEURALNETWORKS_TENSOR_QUANT8_ASYMM, inDims, 4, kActScale, 0);
    if (inIdx < 0) {
        NPU_LOGE("configure: failed to add input operand");
        reset(); return false;
    }

    // Optional resize first.
    int cursor = inIdx;
    if (wantsResize) {
        cursor = buildResize(builderStorage, cursor, tgtW, tgtH);
        if (cursor < 0) {
            NPU_LOGE("configure: buildResize failed");
            reset(); return false;
        }
    }

    // Enhance graph.
    const uint32_t postW = wantsResize ? tgtW : inW;
    const uint32_t postH = wantsResize ? tgtH : inH;
    cursor = buildGraphForPreset(builderStorage, cursor, postW, postH, cfg);
    if (cursor < 0) {
        NPU_LOGE("configure: buildGraphForPreset(preset=%d) failed",
                 static_cast<int>(cfg.preset));
        reset(); return false;
    }

    // If preset == OFF but upscale was requested, the cursor is simply the
    // resize output. Otherwise it's the enhance output. Either way it's our
    // final operand.
    const uint32_t modelInputs[1] = { static_cast<uint32_t>(inIdx) };
    const uint32_t modelOutputs[1] = { static_cast<uint32_t>(cursor) };
    if (ANeuralNetworksModel_identifyInputsAndOutputs(model,
            1, modelInputs, 1, modelOutputs) != kOk) {
        NPU_LOGE("configure: identifyInputsAndOutputs failed");
        reset();
        return false;
    }

    if (cfg.fp16) {
        ANeuralNetworksModel_relaxComputationFloat32toFloat16(model, true);
    }
    if (ANeuralNetworksModel_finish(model) != kOk) {
        NPU_LOGE("configure: ANeuralNetworksModel_finish failed — device rejected the graph "
                 "(preset=%d, op count probably unsupported on this NPU)",
                 static_cast<int>(cfg.preset));
        reset();
        return false;
    }

    const int compileRc = ANeuralNetworksCompilation_createForDevices(
        model, npuDevices.data(),
        static_cast<uint32_t>(npuDevices.size()),
        &compilation);
    if (compileRc != kOk || compilation == nullptr) {
        NPU_LOGE("configure: createForDevices failed rc=%d — NPU doesn't support this graph",
                 compileRc);
        reset();
        return false;
    }
    ANeuralNetworksCompilation_setPreference(
        compilation, ANEURALNETWORKS_PREFER_SUSTAINED_SPEED);
    const int finishRc = ANeuralNetworksCompilation_finish(compilation);
    if (finishRc != kOk) {
        NPU_LOGE("configure: compilation.finish failed rc=%d", finishRc);
        reset();
        return false;
    }
    if (ANeuralNetworksBurst_create(compilation, &burst) != kOk) {
        burst = nullptr; // burst is an optimisation; compute() still works
    }
    NPU_LOGI("configure: graph compiled on NPU, burst=%p", (void*)burst);
    return true;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

bool NnapiPostProcessor::processRgba8888(const uint8_t *src,
                                         uint32_t srcStrideBytes,
                                         uint8_t *dst,
                                         uint32_t dstStrideBytes) {
    if (!ready() || src == nullptr || dst == nullptr) {
        return false;
    }

    for (uint32_t y = 0; y < inH; ++y) {
        std::memcpy(inputBuf + y * inW * 4U,
                    src + y * srcStrideBytes,
                    inW * 4U);
    }

    ANeuralNetworksExecution *execution = nullptr;
    const int createRc = ANeuralNetworksExecution_create(compilation, &execution);
    if (createRc != kOk || execution == nullptr) {
        NPU_LOGE("processRgba8888: Execution_create failed rc=%d", createRc);
        return false;
    }
    const int setInRc = ANeuralNetworksExecution_setInput(
        execution, 0, nullptr, inputBuf, inputByteCount);
    const int setOutRc = ANeuralNetworksExecution_setOutput(
        execution, 0, nullptr, outputBuf, outputByteCount);
    int computeRc = -1;
    if (setInRc == kOk && setOutRc == kOk) {
        computeRc = (burst != nullptr)
            ? ANeuralNetworksExecution_burstCompute(execution, burst)
            : ANeuralNetworksExecution_compute(execution);
    }
    ANeuralNetworksExecution_free(execution);
    if (setInRc != kOk || setOutRc != kOk || computeRc != kOk) {
        NPU_LOGE("processRgba8888: setIn=%d setOut=%d compute=%d (burst=%p)",
                 setInRc, setOutRc, computeRc, (void*)burst);
        return false;
    }

    for (uint32_t y = 0; y < outH; ++y) {
        std::memcpy(dst + y * dstStrideBytes,
                    outputBuf + y * outW * 4U,
                    outW * 4U);
    }
    return true;
}

} // namespace lsfg_android
