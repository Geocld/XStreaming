#pragma once

#include <cstdint>
#include <vector>

namespace lsfg_android {

// Pure-CPU post-processing. Runs on the blit thread after the NPU stage
// (or instead of it, when the user picks the CPU category in the UI).
//
// Every preset is a tight row-major scalar loop that fits in ~1-2 ms for
// 1080p on a modern ARMv8 core. We intentionally avoid NEON intrinsics so
// the Clang vectorizer can choose its own strategy per target ABI.

enum class CpuPreset : int {
    OFF          = 0,
    ENHANCE_LUT  = 1,  // contrast boost via 256-entry LUT
    WARM         = 2,  // warm temperature (R+, B-)
    COOL         = 3,  // cool temperature (R-, B+)
    VIGNETTE     = 4,  // radial darken + mild contrast
    GAMER_SHARP  = 5,  // CPU 3x3 unsharp mask
    CINEMATIC    = 6,  // cool shadows, warm highlights, vignette, slight desat
};

struct CpuPostProcessConfig {
    CpuPreset preset = CpuPreset::OFF;
    float strength = 0.5f;    // 0..1 primary amount
    float saturation = 0.5f;  // 0..1 -> [0.7 .. 1.3]
    float vibrance = 0.0f;    // 0..1 — extra saturation weighted toward low-sat pixels
    float vignette = 0.0f;    // 0..1 — darken outer radius
};

class CpuPostProcessor {
public:
    bool configure(uint32_t width, uint32_t height,
                   const CpuPostProcessConfig &config);

    // In-place or copy; src may equal dst (same pixels reprocessed). Returns
    // true if the preset produced output; false if preset == OFF (caller
    // should take the bypass memcpy path instead).
    bool process(const uint8_t *src, uint32_t srcStrideBytes,
                 uint8_t *dst, uint32_t dstStrideBytes,
                 uint32_t w, uint32_t h);

    void reset();

private:
    void rebuildLut();
    uint8_t applyLutR(uint8_t v) const { return lutR[v]; }
    uint8_t applyLutG(uint8_t v) const { return lutG[v]; }
    uint8_t applyLutB(uint8_t v) const { return lutB[v]; }

    CpuPostProcessConfig cfg{};
    uint32_t lastW = 0;
    uint32_t lastH = 0;
    uint8_t lutR[256]{};
    uint8_t lutG[256]{};
    uint8_t lutB[256]{};

    // Precomputed vignette mask (per-row multiplier for the darkest x, plus
    // a row table). We rebuild it on size change. Values are Q8.8 fixed
    // point (multiply, >> 8) for a couple of fewer multiplications in the
    // hot loop.
    std::vector<uint16_t> vignetteMask;
};

} // namespace lsfg_android
