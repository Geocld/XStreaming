#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace lsfg_android {

// Error codes returned to Kotlin via JNI. Keep kOk == 0.
constexpr int kOk = 0;
constexpr int kErrDllUnreadable = -1;
constexpr int kErrMissingResource = -2;
constexpr int kErrTranslationFailed = -3;
constexpr int kErrWriteFailed = -4;

// Parses Lossless.dll at [dllPath], extracts every RCDATA resource that LSFG
// uses, and writes one file per resource. Three caches get populated:
//   - <cacheDir>/<resId>.spv          DXBC (255..302) translated DXBC→SPIR-V via dxvk
//   - <cacheDir>/fp16/<resId>.spv     FP16 SPIR-V (304..351) verbatim from DLL
//   - <cacheDir>/fp32/<resId>.spv     FP32 SPIR-V (353..400) verbatim from DLL
// Both SPIR-V caches are best-effort: if any blob is missing or has the wrong
// magic the cache is skipped without failing the DXBC extraction. The FP32
// SPIR-V cache exists because the bundled dxvk DXBC translator emits
// `OpCapability VulkanMemoryModel` unconditionally (see thirdparty/dxbc); the
// precompiled FP32 SPIR-V from the DLL uses `OpMemoryModel Logical GLSL450`
// without VMM, so on devices that lack vulkanMemoryModel (Mali Bifrost/Valhall)
// the render loop can prefer it over the dxvk path and stay clear of
// VK_ERROR_DEVICE_LOST on first dispatch.
int extract_dll_to_spirv(const std::string &dllPath, const std::string &cacheDir);

// Source identifier for load_cached_spirv. Replaces the previous bool useFp16.
enum class ShaderCache {
    Dxbc,       // <cacheDir>/<id>.spv         (DXBC translated by dxvk)
    Fp16Spirv,  // <cacheDir>/fp16/<id>.spv    (precompiled FP16 SPIR-V)
    Fp32Spirv,  // <cacheDir>/fp32/<id>.spv    (precompiled FP32 SPIR-V)
};

// Reads a cached SPIR-V file back from disk. Returns an empty vector on
// missing/unreadable files — the caller decides whether that's a fatal error.
std::vector<uint8_t> load_cached_spirv(const std::string &cacheDir, uint32_t resId,
                                       ShaderCache source = ShaderCache::Dxbc);

// Maps a framegen shader name (e.g. "p_mipmaps", "p_alpha[2]", "generate")
// to the DXBC resource ID (255..302) that lives on disk as <cacheDir>/<id>.spv.
// Returns 0 if the name is unknown.
//
// Mirror of Extract::nameIdxTable in lsfg-vk-android/src/extract/extract.cpp.
uint32_t shader_name_to_resource_id(const std::string &name);

// Same lookup, but returning the SPIR-V FP16 resource ID (304..351). The FP16
// set is a parallel SPIR-V variant precompiled into Lossless.dll with the
// `OpCapability Float16` enabled and mixed FP16/FP32 ops. The mapping is a
// constant +49 offset over shader_name_to_resource_id(). Returns 0 if the
// name is unknown OR if the corresponding FP16 ID is not in the supported
// range (currently 304..351).
uint32_t shader_name_to_resource_id_fp16(const std::string &name);

// Returns true when the FP16 cache directory contains every shader in the
// 304..351 range. Used by the render loop to fall back to the DXBC FP32 path
// transparently when the user toggles FP16 on but the DLL extraction skipped
// the FP16 set (e.g. for an older DLL build that doesn't include them).
bool fp16_shaders_available(const std::string &cacheDir);

// Same lookup as shader_name_to_resource_id but returning the FP32 SPIR-V
// resource ID (353..400). Constant +98 offset over the DXBC id. Returns 0
// if the name is unknown OR the resulting id falls outside 353..400.
uint32_t shader_name_to_resource_id_fp32_spirv(const std::string &name);

// Returns true when the FP32 SPIR-V cache directory contains every shader in
// the 353..400 range. Preferred over the DXBC path on devices that lack
// vulkanMemoryModel (the dxvk DXBC translator emits OpCapability
// VulkanMemoryModel unconditionally, while the precompiled FP32 SPIR-V from
// the DLL uses Logical GLSL450 with no VMM — verified across the entire
// range in _analysis/*.dis and _analysis/fp32/).
bool fp32_spirv_shaders_available(const std::string &cacheDir);

} // namespace lsfg_android
