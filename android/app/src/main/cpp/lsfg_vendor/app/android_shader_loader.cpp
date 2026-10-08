// On-device port of Extract::extractShaders + Extract::translateShader.
//
// On Linux the DLL path is discovered from Steam install locations. On Android
// the user picks the file via SAF and Kotlin copies it to a local path under
// the app's filesDir before calling into native. This file only implements
// the PE parsing + DXBC→SPIR-V translation and caches one .spv per resource
// ID into a caller-chosen cache directory.

#include "android_shader_loader.hpp"

#include <pe-parse/parse.h>

#include <dxbc_modinfo.h>
#include <dxbc_module.h>
#include <dxbc_reader.h>
#include <thirdparty/spirv.hpp>

#include <android/log.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <sys/stat.h>
#include <unordered_map>
#include <vector>

#include "crash_reporter.hpp"

#define LOG_TAG "lsfg-extract"
#define LOGE(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_ERROR, __VA_ARGS__)
#define LOGI(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_INFO,  __VA_ARGS__)

namespace {

// Resource IDs used by both LSFG 3.1 and the 3.1P "performance" variant.
// Kept in sync with lsfg-vk/src/extract/extract.cpp::nameIdxTable.
constexpr uint32_t kResourceIds[] = {
    255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266,
    267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279,
    280, 281, 282, 283, 284, 285, 286, 287, 288, 289,
    290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302,
};

// FP16 SPIR-V variants live as RCDATA at DXBC_id + 49 (range 304..351).
// They're already SPIR-V — no DXBC translation needed. The blob has
// OpCapability Float16 and mixed FP16/FP32 OpTypeFloat. See
// patches/LosslessScaling/findings.md for the full mapping table.
constexpr uint32_t kFp16IdOffset = 49;

// FP32 SPIR-V variants live as RCDATA at DXBC_id + 98 (range 353..400).
// Same shaders, no Float16 capability, MemoryModel Logical GLSL450 (no
// VulkanMemoryModel) — verified in _analysis/fp32/ via dump_fp32_spv.py.
// Preferred over the DXBC translator path on devices without vulkanMemoryModel.
constexpr uint32_t kFp32SpirvIdOffset = 98;

// SPIR-V LE magic word (0x07230203). Used to validate FP16 blobs before
// caching them — if THS reshuffles resource layout in a future Lossless.dll
// update, IDs 304..351 may stop being SPIR-V; we silently skip those instead
// of caching garbage.
constexpr std::array<uint8_t, 4> kSpirvMagic{0x03, 0x02, 0x23, 0x07};

struct ExtractionCtx {
    std::unordered_map<uint32_t, std::vector<uint8_t>> *out;
};

int on_resource(void *userData, const peparse::resource &res) {
    auto *ctx = static_cast<ExtractionCtx *>(userData);
    if (res.type != peparse::RT_RCDATA || res.buf == nullptr || res.buf->bufLen <= 0) {
        return 0;
    }
    std::vector<uint8_t> data(res.buf->bufLen);
    std::copy_n(res.buf->buf, res.buf->bufLen, data.data());
    (*ctx->out)[res.name] = std::move(data);
    return 0;
}

struct BindingOffsets {
    uint32_t bindingIndex{};
    uint32_t bindingOffset{};
    uint32_t setIndex{};
    uint32_t setOffset{};
};

// SPIR-V header layout: [magic][version][generator][bound][schema]
// Vulkan 1.1 supports up to SPIR-V 1.3 (0x00010300). The dxvk compiler
// targets SPIR-V 1.6 which Mali rejects at JIT compilation time. Patch the
// version word down so the driver accepts the bytecode.
void cap_spirv_version(std::vector<uint8_t> &spirv) {
    if (spirv.size() < 20) return;
    uint32_t ver;
    std::memcpy(&ver, spirv.data() + 4, 4);
    if (ver > 0x00010300u) {
        ver = 0x00010300u;
        std::memcpy(spirv.data() + 4, &ver, 4);
    }
}

// Renumber Binding decorations to match the descriptor layout expected by the
// framegen library (lsfg-vk-android).
//
// The framework builds its VkDescriptorSetLayout by counting bindings from 0
// in a *type-grouped* order: first uniform buffers, then samplers, then
// sampled images, then storage images. See e.g.
// `framegen/v3.1p_src/shaders/mipmaps.cpp:19-23` which declares
//   { 1, UNIFORM_BUFFER }, { 1, SAMPLER }, { 1, SAMPLED_IMAGE }, { 7, STORAGE_IMAGE }
// and ShaderModule fills `binding = 0..N-1` over that flattened sequence.
//
// The DXBC→SPIR-V translator path (translate_dxbc_to_spirv) gets this for
// free because DXVK happens to emit OpDecorate Binding decorations in the
// matching order. The FP16 path consumes precompiled SPIR-V straight from
// Lossless.dll where the bindings are HLSL register slots and the
// OpDecorate ordering is `sampler, sampled_image, storage_image..., cb`
// (cb last) — flattened in declaration order this puts the uniform buffer
// at slot 9 instead of 0, mismatching the layout and producing the symptoms
// the user reported (black flashes alternating with valid frames, top-left
// black rectangle that grows with flowScale).
//
// The fix: classify each variable by its underlying type kind, then assign
// dense bindings in the framework's expected group order, breaking ties by
// the variable's original binding number so the relative order within a
// group (e.g. Output0..Output6) is preserved.
//
// Returns true on success. Returns false on an unrecognised SPIR-V header
// or malformed module so the extractor can skip the blob without corrupting
// the cache.
bool rewrite_spirv_bindings_dense(std::vector<uint8_t> &spirv) {
    if (spirv.size() < 20 || (spirv.size() % 4) != 0) {
        return false;
    }
    auto *words = reinterpret_cast<uint32_t *>(spirv.data());
    const size_t wordCount = spirv.size() / 4;
    if (words[0] != 0x07230203u) {
        return false;
    }

    // SPIR-V opcodes / decorations we care about.
    constexpr uint32_t kOpName = 5;
    constexpr uint32_t kOpTypeImage = 25;
    constexpr uint32_t kOpTypeSampler = 26;
    constexpr uint32_t kOpTypeSampledImage = 27;
    constexpr uint32_t kOpTypeStruct = 30;
    constexpr uint32_t kOpTypePointer = 32;
    constexpr uint32_t kOpVariable = 59;
    constexpr uint32_t kOpDecorate = 71;
    constexpr uint32_t kOpFunction = 54;
    constexpr uint32_t kDecorationBinding = 33;

    // Kind ordering matches the descriptor type order the framework emits at
    // ShaderModule build time. Lower number = earlier in the layout.
    enum Kind : int {
        KindUnknown = 4,
        KindUniformBuffer = 0,
        KindSampler = 1,
        KindSampledImage = 2,
        KindStorageImage = 3,
    };

    struct BindingSite {
        size_t valueWordIndex;
        uint32_t varId;
        uint32_t origBinding;
        Kind kind;
    };

    // First pass: gather type info, variable->pointer mapping, and binding
    // sites. Stop at OpFunction — bindings only appear in the declaration
    // section before any function bodies.
    std::unordered_map<uint32_t, Kind> typeKind;            // type id -> Kind
    std::unordered_map<uint32_t, uint32_t> ptrPointee;       // pointer type id -> pointee type id
    std::unordered_map<uint32_t, uint32_t> varType;          // var id -> pointer type id
    std::vector<BindingSite> sites;
    sites.reserve(32);

    size_t i = 5; // skip 5-word SPIR-V header
    while (i < wordCount) {
        const uint32_t header = words[i];
        const uint32_t wc = (header >> 16) & 0xFFFFu;
        const uint32_t op = header & 0xFFFFu;
        if (wc == 0 || i + wc > wordCount) {
            return false; // malformed
        }
        if (op == kOpFunction) {
            break;
        }
        switch (op) {
            case kOpTypeSampler:
                if (wc >= 2) typeKind[words[i + 1]] = KindSampler;
                break;
            case kOpTypeImage:
                if (wc >= 8) {
                    // OpTypeImage: id, sampledType, dim, depth, arrayed, ms, sampled, format
                    // sampled == 1: sampled image (read-only); sampled == 2: storage image (read/write)
                    typeKind[words[i + 1]] = (words[i + 7] == 2) ? KindStorageImage : KindSampledImage;
                }
                break;
            case kOpTypeSampledImage:
                if (wc >= 2) typeKind[words[i + 1]] = KindSampledImage;
                break;
            case kOpTypeStruct:
                // We assume any struct backing a binding is a uniform buffer.
                // The CB layout in Lossless.dll is consistent (verified
                // statically across all FP16/FP32 variants).
                if (wc >= 2) typeKind[words[i + 1]] = KindUniformBuffer;
                break;
            case kOpTypePointer:
                // OpTypePointer: id, storageClass, type
                if (wc == 4) ptrPointee[words[i + 1]] = words[i + 3];
                break;
            case kOpVariable:
                // OpVariable: resultType (pointer), resultId, storageClass, [initializer]
                if (wc >= 4) varType[words[i + 2]] = words[i + 1];
                break;
            case kOpDecorate:
                if (wc == 4 && words[i + 2] == kDecorationBinding) {
                    sites.push_back({i + 3, words[i + 1], words[i + 3], KindUnknown});
                }
                break;
            default:
                break;
        }
        i += wc;
    }

    // Resolve each binding site's kind via varId -> pointer -> pointee type.
    for (auto &s : sites) {
        const auto vt = varType.find(s.varId);
        if (vt == varType.end()) continue;
        const auto pp = ptrPointee.find(vt->second);
        if (pp == ptrPointee.end()) continue;
        const auto tk = typeKind.find(pp->second);
        if (tk != typeKind.end()) {
            s.kind = tk->second;
        }
    }

    // Sort by (kind, original binding) so the framework's flat sequence
    //   [uniform, sampler, sampled, storage_image_0..N-1]
    // lines up. Stable sort to preserve input order for any ties (none
    // expected, but defensive). Returns false if any site stayed unknown:
    // that means we couldn't classify it, and renumbering would silently
    // misroute the shader — better to skip the blob entirely.
    for (const auto &s : sites) {
        if (s.kind == KindUnknown) {
            return false;
        }
    }
    std::stable_sort(sites.begin(), sites.end(), [](const BindingSite &a, const BindingSite &b) {
        if (a.kind != b.kind) return static_cast<int>(a.kind) < static_cast<int>(b.kind);
        return a.origBinding < b.origBinding;
    });

    for (size_t k = 0; k < sites.size(); ++k) {
        words[sites[k].valueWordIndex] = static_cast<uint32_t>(k);
    }
    return true;
}

std::vector<uint8_t> translate_dxbc_to_spirv(const std::vector<uint8_t> &bytecode) {
    dxvk::DxbcReader reader(reinterpret_cast<const char *>(bytecode.data()), bytecode.size());
    dxvk::DxbcModule module(reader);
    const dxvk::DxbcModuleInfo info{};
    auto code = module.compile(info, "CS");

    std::vector<BindingOffsets> bindingOffsets;
    std::vector<uint32_t> varIds;
    for (auto ins : code) {
        if (ins.opCode() == spv::OpDecorate) {
            if (ins.arg(2) == spv::DecorationBinding) {
                const uint32_t varId = ins.arg(1);
                bindingOffsets.resize(std::max(bindingOffsets.size(), size_t(varId + 1)));
                bindingOffsets[varId].bindingIndex = ins.arg(3);
                bindingOffsets[varId].bindingOffset = ins.offset() + 3;
                varIds.push_back(varId);
            }
            if (ins.arg(2) == spv::DecorationDescriptorSet) {
                const uint32_t varId = ins.arg(1);
                bindingOffsets.resize(std::max(bindingOffsets.size(), size_t(varId + 1)));
                bindingOffsets[varId].setIndex = ins.arg(3);
                bindingOffsets[varId].setOffset = ins.offset() + 3;
            }
        }
        if (ins.opCode() == spv::OpFunction) {
            break;
        }
    }

    std::vector<BindingOffsets> validBindings;
    for (const auto varId : varIds) {
        const auto info = bindingOffsets[varId];
        if (info.bindingOffset) {
            validBindings.push_back(info);
        }
    }

    for (size_t i = 0; i < validBindings.size(); ++i) {
        code.data()[validBindings[i].bindingOffset] = static_cast<uint8_t>(i);
    }

    std::vector<uint8_t> spirv(code.size());
    std::copy_n(reinterpret_cast<const uint8_t *>(code.data()), code.size(), spirv.data());
    cap_spirv_version(spirv);
    return spirv;
}

bool write_file(const std::string &path, const std::vector<uint8_t> &data) {
    std::ofstream f(path, std::ios::binary | std::ios::trunc);
    if (!f) {
        return false;
    }
    f.write(reinterpret_cast<const char *>(data.data()), static_cast<std::streamsize>(data.size()));
    return f.good();
}

} // namespace

namespace lsfg_android {

int extract_dll_to_spirv(const std::string &dllPath, const std::string &cacheDir) {
    peparse::parsed_pe *dll = peparse::ParsePEFromFile(dllPath.c_str());
    if (!dll) {
        LOGE("ParsePEFromFile failed for %s", dllPath.c_str());
        return kErrDllUnreadable;
    }

    std::unordered_map<uint32_t, std::vector<uint8_t>> blobsByResId;
    ExtractionCtx ctx{&blobsByResId};
    peparse::IterRsrc(dll, on_resource, &ctx);
    peparse::DestructParsedPE(dll);

    // Ensure every DXBC resource we depend on is present.
    for (uint32_t id : kResourceIds) {
        if (blobsByResId.find(id) == blobsByResId.end()) {
            LOGE("Missing resource id %u — is Lossless Scaling up to date?", id);
            return kErrMissingResource;
        }
    }

    int translated = 0;
    for (uint32_t resId : kResourceIds) {
        const auto &dxbc = blobsByResId.at(resId);
        std::vector<uint8_t> spirv;
        try {
            spirv = translate_dxbc_to_spirv(dxbc);
        } catch (const std::exception &e) {
            LOGE("DXBC→SPIR-V failed for resource %u: %s", resId, e.what());
            return kErrTranslationFailed;
        }
        if (spirv.empty()) {
            LOGE("Empty SPIR-V for resource %u", resId);
            return kErrTranslationFailed;
        }

        char path[512];
        std::snprintf(path, sizeof(path), "%s/%u.spv", cacheDir.c_str(), resId);
        if (!write_file(path, spirv)) {
            LOGE("Failed to write %s", path);
            return kErrWriteFailed;
        }
        ++translated;
    }

    LOGI("Translated %d DXBC shaders into %s", translated, cacheDir.c_str());

    // FP16 SPIR-V variants: precompiled in the DLL at DXBC_id + 49. Cache them
    // verbatim into <cacheDir>/fp16/. This is best-effort — a Lossless.dll
    // build that doesn't ship the FP16 set must still produce a working FP32
    // cache. Validation: the blob must start with the SPIR-V LE magic.
    const std::string fp16Dir = cacheDir + "/fp16";
    if (mkdir(fp16Dir.c_str(), 0700) != 0 && errno != EEXIST) {
        LOGE("Failed to create FP16 cache dir %s (errno=%d) — FP16 path disabled", fp16Dir.c_str(), errno);
        return kOk; // FP32 already succeeded; degrade gracefully.
    }
    int fp16Cached = 0;
    int fp16Skipped = 0;
    for (uint32_t dxbcId : kResourceIds) {
        const uint32_t fp16Id = dxbcId + kFp16IdOffset;
        const auto it = blobsByResId.find(fp16Id);
        if (it == blobsByResId.end()) {
            ++fp16Skipped;
            continue;
        }
        // Copy out so we can rewrite Binding decorations to the dense layout
        // the framegen library expects. The FP16 SPIR-V blobs ship with HLSL
        // register slots (t16/s32/u48/b0...) which must be flattened to
        // 0,1,2,... in declaration order — same transformation the DXBC path
        // performs via DXVK's code-stream rewriter.
        std::vector<uint8_t> blob = it->second;
        if (blob.size() < kSpirvMagic.size() ||
            !std::equal(kSpirvMagic.begin(), kSpirvMagic.end(), blob.begin())) {
            ++fp16Skipped;
            continue;
        }
        if (!rewrite_spirv_bindings_dense(blob)) {
            LOGE("FP16 SPIR-V binding rewrite failed for resource %u — skipping", fp16Id);
            ++fp16Skipped;
            continue;
        }
        char path[512];
        std::snprintf(path, sizeof(path), "%s/%u.spv", fp16Dir.c_str(), fp16Id);
        if (!write_file(path, blob)) {
            LOGE("Failed to write FP16 cache %s — FP16 path may be incomplete", path);
            ++fp16Skipped;
            continue;
        }
        ++fp16Cached;
    }
    LOGI("FP16 SPIR-V variants: %d cached, %d skipped (%s)", fp16Cached, fp16Skipped, fp16Dir.c_str());

    // FP32 SPIR-V variants: precompiled in the DLL at DXBC_id + 98 (range
    // 353..400). Same shape as the FP16 cache step above, including the
    // dense-binding rewrite — these blobs ship with HLSL register slots like
    // the FP16 set, so they need the same flatten before the framegen
    // descriptor-set layout will accept them. Best-effort: a missing FP32
    // SPIR-V set falls back to the (already populated) DXBC cache.
    const std::string fp32Dir = cacheDir + "/fp32";
    if (mkdir(fp32Dir.c_str(), 0700) != 0 && errno != EEXIST) {
        LOGE("Failed to create FP32 SPIR-V cache dir %s (errno=%d) — FP32 SPIR-V path disabled",
             fp32Dir.c_str(), errno);
        return kOk;
    }
    int fp32SpvCached = 0;
    int fp32SpvSkipped = 0;
    for (uint32_t dxbcId : kResourceIds) {
        const uint32_t fp32Id = dxbcId + kFp32SpirvIdOffset;
        const auto it = blobsByResId.find(fp32Id);
        if (it == blobsByResId.end()) {
            ++fp32SpvSkipped;
            continue;
        }
        std::vector<uint8_t> blob = it->second;
        if (blob.size() < kSpirvMagic.size() ||
            !std::equal(kSpirvMagic.begin(), kSpirvMagic.end(), blob.begin())) {
            ++fp32SpvSkipped;
            continue;
        }
        if (!rewrite_spirv_bindings_dense(blob)) {
            LOGE("FP32 SPIR-V binding rewrite failed for resource %u — skipping", fp32Id);
            ++fp32SpvSkipped;
            continue;
        }
        char path[512];
        std::snprintf(path, sizeof(path), "%s/%u.spv", fp32Dir.c_str(), fp32Id);
        if (!write_file(path, blob)) {
            LOGE("Failed to write FP32 SPIR-V cache %s — FP32 SPIR-V path may be incomplete", path);
            ++fp32SpvSkipped;
            continue;
        }
        ++fp32SpvCached;
    }
    LOGI("FP32 SPIR-V variants: %d cached, %d skipped (%s)",
         fp32SpvCached, fp32SpvSkipped, fp32Dir.c_str());
    return kOk;
}

std::vector<uint8_t> load_cached_spirv(const std::string &cacheDir, uint32_t resId,
                                       ShaderCache source) {
    char path[512];
    switch (source) {
        case ShaderCache::Fp16Spirv:
            std::snprintf(path, sizeof(path), "%s/fp16/%u.spv", cacheDir.c_str(), resId);
            break;
        case ShaderCache::Fp32Spirv:
            std::snprintf(path, sizeof(path), "%s/fp32/%u.spv", cacheDir.c_str(), resId);
            break;
        case ShaderCache::Dxbc:
        default:
            std::snprintf(path, sizeof(path), "%s/%u.spv", cacheDir.c_str(), resId);
            break;
    }
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f) {
        return {};
    }
    const auto size = f.tellg();
    f.seekg(0, std::ios::beg);
    std::vector<uint8_t> out(static_cast<size_t>(size));
    f.read(reinterpret_cast<char *>(out.data()), static_cast<std::streamsize>(size));
    cap_spirv_version(out);  // fix shaders cached before the SPIR-V 1.3 downgrade
    return out;
}

// Mirror of Extract::nameIdxTable in lsfg-vk-android/src/extract/extract.cpp
// (Steam Deck side). Framegen asks for shaders by symbolic name; on Android
// we cache them on disk by numeric resource ID, so we need to translate.
uint32_t shader_name_to_resource_id(const std::string &name) {
    static const std::unordered_map<std::string, uint32_t> kTable = {
        { "mipmaps",     255 },
        { "alpha[0]",    267 },
        { "alpha[1]",    268 },
        { "alpha[2]",    269 },
        { "alpha[3]",    270 },
        { "beta[0]",     275 },
        { "beta[1]",     276 },
        { "beta[2]",     277 },
        { "beta[3]",     278 },
        { "beta[4]",     279 },
        { "gamma[0]",    257 },
        { "gamma[1]",    259 },
        { "gamma[2]",    260 },
        { "gamma[3]",    261 },
        { "gamma[4]",    262 },
        { "delta[0]",    257 },
        { "delta[1]",    263 },
        { "delta[2]",    264 },
        { "delta[3]",    265 },
        { "delta[4]",    266 },
        { "delta[5]",    258 },
        { "delta[6]",    271 },
        { "delta[7]",    272 },
        { "delta[8]",    273 },
        { "delta[9]",    274 },
        { "generate",    256 },
        { "p_mipmaps",   255 },
        { "p_alpha[0]",  290 },
        { "p_alpha[1]",  291 },
        { "p_alpha[2]",  292 },
        { "p_alpha[3]",  293 },
        { "p_beta[0]",   298 },
        { "p_beta[1]",   299 },
        { "p_beta[2]",   300 },
        { "p_beta[3]",   301 },
        { "p_beta[4]",   302 },
        { "p_gamma[0]",  280 },
        { "p_gamma[1]",  282 },
        { "p_gamma[2]",  283 },
        { "p_gamma[3]",  284 },
        { "p_gamma[4]",  285 },
        { "p_delta[0]",  280 },
        { "p_delta[1]",  286 },
        { "p_delta[2]",  287 },
        { "p_delta[3]",  288 },
        { "p_delta[4]",  289 },
        { "p_delta[5]",  281 },
        { "p_delta[6]",  294 },
        { "p_delta[7]",  295 },
        { "p_delta[8]",  296 },
        { "p_delta[9]",  297 },
        { "p_generate",  256 },
    };
    auto it = kTable.find(name);
    return it == kTable.end() ? 0u : it->second;
}

uint32_t shader_name_to_resource_id_fp16(const std::string &name) {
    const uint32_t dxbcId = shader_name_to_resource_id(name);
    if (dxbcId == 0) {
        return 0;
    }
    const uint32_t fp16Id = dxbcId + kFp16IdOffset;
    // Guard against accidentally walking off the FP16 SPIR-V range. Anything
    // outside 304..351 means the DXBC id is out of the LSFG framegen set
    // (shouldn't happen because shader_name_to_resource_id only returns
    // 255..302), or the DLL layout has changed in a future release.
    if (fp16Id < 304 || fp16Id > 351) {
        return 0;
    }
    return fp16Id;
}

bool fp16_shaders_available(const std::string &cacheDir) {
    // Quick existence check — the loader callback handles missing-file fallback
    // per-shader, but we want a single boolean for the UI capability gate
    // (so the FP16 toggle can grey out when the DLL didn't ship the FP16 set
    // or when extraction skipped them).
    for (uint32_t dxbcId : kResourceIds) {
        const uint32_t fp16Id = dxbcId + kFp16IdOffset;
        if (fp16Id < 304 || fp16Id > 351) continue;
        char path[512];
        std::snprintf(path, sizeof(path), "%s/fp16/%u.spv", cacheDir.c_str(), fp16Id);
        struct stat st{};
        if (stat(path, &st) != 0 || st.st_size < 20) {
            return false;
        }
    }
    return true;
}

uint32_t shader_name_to_resource_id_fp32_spirv(const std::string &name) {
    const uint32_t dxbcId = shader_name_to_resource_id(name);
    if (dxbcId == 0) {
        return 0;
    }
    const uint32_t fp32Id = dxbcId + kFp32SpirvIdOffset;
    if (fp32Id < 353 || fp32Id > 400) {
        return 0;
    }
    return fp32Id;
}

bool fp32_spirv_shaders_available(const std::string &cacheDir) {
    for (uint32_t dxbcId : kResourceIds) {
        const uint32_t fp32Id = dxbcId + kFp32SpirvIdOffset;
        if (fp32Id < 353 || fp32Id > 400) continue;
        char path[512];
        std::snprintf(path, sizeof(path), "%s/fp32/%u.spv", cacheDir.c_str(), fp32Id);
        struct stat st{};
        if (stat(path, &st) != 0 || st.st_size < 20) {
            return false;
        }
    }
    return true;
}

} // namespace lsfg_android
