#include "nnapi_npu.hpp"

#include <android/NeuralNetworks.h>
#include <sys/system_properties.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <sstream>
#include <string>
#include <vector>

namespace lsfg_android {

namespace {

std::string lowercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

bool contains_any(const std::string &value, const char *const *needles, size_t count) {
    for (size_t i = 0; i < count; ++i) {
        if (value.find(needles[i]) != std::string::npos) {
            return true;
        }
    }
    return false;
}

bool is_dedicated_nnapi_accelerator(const ANeuralNetworksDevice *device) {
    int32_t type = ANEURALNETWORKS_DEVICE_UNKNOWN;
    if (ANeuralNetworksDevice_getType(device, &type) != ANEURALNETWORKS_NO_ERROR) {
        return false;
    }
    if (type == ANEURALNETWORKS_DEVICE_ACCELERATOR) {
        return true;
    }
    if (type == ANEURALNETWORKS_DEVICE_CPU || type == ANEURALNETWORKS_DEVICE_GPU) {
        return false;
    }

    const char *rawName = nullptr;
    ANeuralNetworksDevice_getName(device, &rawName);
    const std::string name = lowercase(rawName != nullptr ? rawName : "");
    static constexpr const char *kReject[] = {
        "cpu", "gpu", "reference", "nnapi-reference", "google-edgetpu-placeholder"
    };
    if (contains_any(name, kReject, std::size(kReject))) {
        return false;
    }

    static constexpr const char *kNpuBackends[] = {
        "npu", "dsp", "hexagon", "hta", "htp", "qti", "snpe",
        "apu", "neuron", "mediatek", "mtk",
        "eden", "exynos", "samsung",
        "kirin", "hiai", "ascend",
        "vsi", "vip", "ethos", "ane", "tpu"
    };
    return type == ANEURALNETWORKS_DEVICE_OTHER &&
           contains_any(name, kNpuBackends, std::size(kNpuBackends));
}

std::string android_property(const char *key) {
    char value[PROP_VALUE_MAX] = {};
    const int len = __system_property_get(key, value);
    return len > 0 ? std::string(value, static_cast<size_t>(len)) : std::string();
}

std::string soc_fingerprint() {
    std::ostringstream out;
    out << android_property("ro.soc.manufacturer") << ' '
        << android_property("ro.soc.model") << ' '
        << android_property("ro.hardware") << ' '
        << android_property("ro.board.platform") << ' '
        << android_property("ro.product.board") << ' '
        << android_property("ro.boot.hardware");
    return lowercase(out.str());
}

bool has_snapdragon_npu_by_soc() {
    const std::string soc = soc_fingerprint();
    static constexpr const char *kQualcommSocMarkers[] = {
        "qualcomm", "qcom", "snapdragon", "sm8", "sm8750", "sm8850",
        "pineapple", "sun", "kalama", "taro", "lahaina", "kona"
    };
    return contains_any(soc, kQualcommSocMarkers, std::size(kQualcommSocMarkers));
}

std::string device_type_name(int32_t type) {
    switch (type) {
        case ANEURALNETWORKS_DEVICE_OTHER: return "other";
        case ANEURALNETWORKS_DEVICE_CPU: return "cpu";
        case ANEURALNETWORKS_DEVICE_GPU: return "gpu";
        case ANEURALNETWORKS_DEVICE_ACCELERATOR: return "accelerator";
        default: return "unknown";
    }
}

} // namespace

bool nnapi_has_npu_accelerator() {
    if (!nnapi_npu_accelerator_devices().empty()) {
        return true;
    }
    return has_snapdragon_npu_by_soc();
}

std::vector<ANeuralNetworksDevice *> nnapi_npu_accelerator_devices() {
    std::vector<ANeuralNetworksDevice *> devices;
    uint32_t count = 0;
    if (ANeuralNetworks_getDeviceCount(&count) != ANEURALNETWORKS_NO_ERROR) {
        return devices;
    }
    for (uint32_t i = 0; i < count; ++i) {
        ANeuralNetworksDevice *device = nullptr;
        if (ANeuralNetworks_getDevice(i, &device) == ANEURALNETWORKS_NO_ERROR &&
                device != nullptr && is_dedicated_nnapi_accelerator(device)) {
            devices.push_back(device);
        }
    }
    return devices;
}

std::string nnapi_npu_summary() {
    uint32_t count = 0;
    if (ANeuralNetworks_getDeviceCount(&count) != ANEURALNETWORKS_NO_ERROR) {
        return "NNAPI device query failed";
    }
    if (count == 0) {
        const std::string soc = soc_fingerprint();
        return has_snapdragon_npu_by_soc()
            ? "No NNAPI devices reported; Snapdragon/Qualcomm SoC fallback matched: " + soc
            : "No NNAPI devices reported; SoC: " + soc;
    }

    std::ostringstream out;
    bool wroteAny = false;
    for (uint32_t i = 0; i < count; ++i) {
        ANeuralNetworksDevice *device = nullptr;
        if (ANeuralNetworks_getDevice(i, &device) != ANEURALNETWORKS_NO_ERROR ||
                device == nullptr) {
            continue;
        }

        const char *name = nullptr;
        int32_t type = ANEURALNETWORKS_DEVICE_UNKNOWN;
        int64_t featureLevel = 0;
        ANeuralNetworksDevice_getName(device, &name);
        ANeuralNetworksDevice_getType(device, &type);
        ANeuralNetworksDevice_getFeatureLevel(device, &featureLevel);

        if (wroteAny) out << "; ";
        wroteAny = true;
        out << (name != nullptr ? name : "unnamed")
            << " (" << device_type_name(type)
            << ", featureLevel=" << featureLevel << ")";
    }

    const std::string devices = wroteAny ? out.str() : "No readable NNAPI devices";
    const std::string soc = soc_fingerprint();
    if (has_snapdragon_npu_by_soc()) {
        return devices + "; Snapdragon/Qualcomm SoC fallback matched: " + soc;
    }
    return devices + "; SoC: " + soc;
}

} // namespace lsfg_android
