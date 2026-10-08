#include "cpu_postprocess.hpp"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace lsfg_android {

namespace {

constexpr float kPi = 3.14159265358979323846f;

float clamp01(float v) {
    return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
}

uint8_t clamp_u8(int v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return static_cast<uint8_t>(v);
}

// Contrast around the midpoint, then optional per-channel tint. `tint` is
// additive in [-0.15, 0.15] (255 units ≈ 38 at max). `gain` is 1.0..1.3.
uint8_t contrast_tint(int v, float gain, float tint) {
    const float centered = static_cast<float>(v) - 127.5f;
    const float out = 127.5f + centered * gain + tint * 255.0f;
    return clamp_u8(static_cast<int>(std::lround(out)));
}

} // namespace

void CpuPostProcessor::reset() {
    cfg = {};
    lastW = 0;
    lastH = 0;
    for (int i = 0; i < 256; ++i) {
        lutR[i] = static_cast<uint8_t>(i);
        lutG[i] = static_cast<uint8_t>(i);
        lutB[i] = static_cast<uint8_t>(i);
    }
    vignetteMask.clear();
}

void CpuPostProcessor::rebuildLut() {
    const float s = clamp01(cfg.strength);
    const float contrast = 1.0f + 0.30f * s;

    float rTint = 0.0f, gTint = 0.0f, bTint = 0.0f;

    switch (cfg.preset) {
        case CpuPreset::ENHANCE_LUT:
        case CpuPreset::GAMER_SHARP:
        case CpuPreset::VIGNETTE:
        case CpuPreset::OFF:
            break;
        case CpuPreset::WARM:
            rTint =  0.06f * s;
            gTint =  0.02f * s;
            bTint = -0.06f * s;
            break;
        case CpuPreset::COOL:
            rTint = -0.06f * s;
            gTint =  0.00f * s;
            bTint =  0.06f * s;
            break;
        case CpuPreset::CINEMATIC:
            // Subtle teal-and-orange: warm highs, cool shadows. Built later
            // in the per-pixel path because it's luma-dependent; LUT stays
            // identity here.
            break;
    }

    for (int i = 0; i < 256; ++i) {
        lutR[i] = contrast_tint(i, contrast, rTint);
        lutG[i] = contrast_tint(i, contrast, gTint);
        lutB[i] = contrast_tint(i, contrast, bTint);
    }
}

bool CpuPostProcessor::configure(uint32_t width, uint32_t height,
                                 const CpuPostProcessConfig &config) {
    cfg = config;
    rebuildLut();

    if (width != lastW || height != lastH || vignetteMask.empty()) {
        lastW = width;
        lastH = height;
        vignetteMask.assign(static_cast<size_t>(width) * height, 256);
        if (cfg.vignette > 0.0001f && width > 0 && height > 0) {
            const float cx = (width - 1) * 0.5f;
            const float cy = (height - 1) * 0.5f;
            const float norm = 1.0f / std::sqrt(cx * cx + cy * cy);
            const float strength = clamp01(cfg.vignette);
            for (uint32_t y = 0; y < height; ++y) {
                const float dy = (static_cast<float>(y) - cy) * norm;
                for (uint32_t x = 0; x < width; ++x) {
                    const float dx = (static_cast<float>(x) - cx) * norm;
                    const float r = std::min(1.0f, std::sqrt(dx * dx + dy * dy));
                    // Cosine falloff starting at 60% of radius.
                    const float t = std::max(0.0f, (r - 0.6f) / 0.4f);
                    const float darken = 1.0f - strength * (1.0f - std::cos(kPi * 0.5f * t));
                    vignetteMask[y * width + x] =
                        static_cast<uint16_t>(std::lround(darken * 256.0f));
                }
            }
        }
    }
    return cfg.preset != CpuPreset::OFF ||
           cfg.vignette > 0.0001f ||
           cfg.saturation != 0.5f ||
           cfg.vibrance > 0.0001f;
}

bool CpuPostProcessor::process(const uint8_t *src, uint32_t srcStride,
                               uint8_t *dst, uint32_t dstStride,
                               uint32_t w, uint32_t h) {
    if (cfg.preset == CpuPreset::OFF &&
            cfg.vignette <= 0.0001f &&
            cfg.saturation == 0.5f &&
            cfg.vibrance <= 0.0001f) {
        return false;
    }

    // Saturation is centered at 0.5 -> identity; each 0.1 step = +/- 0.06.
    const float sat = 1.0f + (cfg.saturation - 0.5f) * 0.6f;
    const bool doSat = std::fabs(sat - 1.0f) > 0.005f;
    const float vibr = clamp01(cfg.vibrance);
    const bool doVibr = vibr > 0.005f;
    const bool doVignette = !vignetteMask.empty() && cfg.vignette > 0.0001f;
    const bool doCinematic = cfg.preset == CpuPreset::CINEMATIC;

    // GAMER_SHARP: 3x3 unsharp mask in CPU. We convolve in-place using a
    // row buffer so a single output row depends on three input rows.
    const bool doSharp = cfg.preset == CpuPreset::GAMER_SHARP;
    const float sharpAmount = clamp01(cfg.strength);
    std::vector<uint8_t> blurRow;
    if (doSharp) {
        blurRow.resize(static_cast<size_t>(w) * 4);
    }

    for (uint32_t y = 0; y < h; ++y) {
        const uint8_t *srcRow = src + y * srcStride;
        uint8_t *dstRow = dst + y * dstStride;

        // Optional 3x3 blur computed on the fly into blurRow. Duplicate
        // edge rows at the image borders.
        if (doSharp) {
            const uint8_t *rowUp   = src + (y == 0 ? 0 : (y - 1)) * srcStride;
            const uint8_t *rowDown = src + (y + 1 >= h ? y : (y + 1)) * srcStride;
            for (uint32_t x = 0; x < w; ++x) {
                const uint32_t xl = (x == 0) ? 0 : (x - 1);
                const uint32_t xr = (x + 1 >= w) ? x : (x + 1);
                for (int ch = 0; ch < 3; ++ch) {
                    const int sum =
                        rowUp[xl * 4 + ch]   + (rowUp[x * 4 + ch]   << 1) + rowUp[xr * 4 + ch] +
                        (srcRow[xl * 4 + ch] << 1) + (srcRow[x * 4 + ch] << 2) + (srcRow[xr * 4 + ch] << 1) +
                        rowDown[xl * 4 + ch] + (rowDown[x * 4 + ch] << 1) + rowDown[xr * 4 + ch];
                    blurRow[x * 4 + ch] = static_cast<uint8_t>(sum >> 4); // /16
                }
                blurRow[x * 4 + 3] = srcRow[x * 4 + 3];
            }
        }

        for (uint32_t x = 0; x < w; ++x) {
            const uint32_t base = x * 4;
            int r = srcRow[base + 0];
            int g = srcRow[base + 1];
            int b = srcRow[base + 2];
            const int aAlpha = srcRow[base + 3];

            if (doSharp) {
                const int br = blurRow[base + 0];
                const int bg = blurRow[base + 1];
                const int bb = blurRow[base + 2];
                const int amountFixed = static_cast<int>(std::lround(sharpAmount * 256.0f));
                r = r + (((r - br) * amountFixed) >> 8);
                g = g + (((g - bg) * amountFixed) >> 8);
                b = b + (((b - bb) * amountFixed) >> 8);
            }

            // Tone/tint LUT (identity unless preset uses it).
            r = lutR[clamp_u8(r)];
            g = lutG[clamp_u8(g)];
            b = lutB[clamp_u8(b)];

            if (doCinematic) {
                // Teal-and-orange: boost red/orange in highlights, push
                // cyan/teal in shadows. Luma based interpolation.
                const int yLuma = (77 * r + 150 * g + 29 * b) >> 8;
                const float t = yLuma / 255.0f;
                const float s = clamp01(cfg.strength);
                r = clamp_u8(r + static_cast<int>(std::lround((t - 0.5f) * 32.0f * s)));
                b = clamp_u8(b + static_cast<int>(std::lround(((1.0f - t) - 0.5f) * 32.0f * s)));
                g = clamp_u8(g + static_cast<int>(std::lround((t - 0.5f) * 6.0f * s)));
            }

            if (doSat || doVibr) {
                const int yLuma = (77 * r + 150 * g + 29 * b) >> 8;
                float ss = sat;
                if (doVibr) {
                    // Vibrance pulls low-saturation pixels harder than already
                    // saturated ones: estimate local saturation as max-min /
                    // max and weight the boost by (1 - that).
                    const int mx = std::max({r, g, b});
                    const int mn = std::min({r, g, b});
                    const float localSat = mx > 0 ? static_cast<float>(mx - mn) / mx : 0.0f;
                    ss += vibr * 0.30f * (1.0f - localSat);
                }
                r = clamp_u8(yLuma + static_cast<int>(std::lround((r - yLuma) * ss)));
                g = clamp_u8(yLuma + static_cast<int>(std::lround((g - yLuma) * ss)));
                b = clamp_u8(yLuma + static_cast<int>(std::lround((b - yLuma) * ss)));
            }

            if (doVignette) {
                const uint32_t mask = vignetteMask[y * w + x];
                r = (r * mask) >> 8;
                g = (g * mask) >> 8;
                b = (b * mask) >> 8;
            }

            dstRow[base + 0] = clamp_u8(r);
            dstRow[base + 1] = clamp_u8(g);
            dstRow[base + 2] = clamp_u8(b);
            dstRow[base + 3] = static_cast<uint8_t>(aAlpha);
        }
    }
    return true;
}

} // namespace lsfg_android
