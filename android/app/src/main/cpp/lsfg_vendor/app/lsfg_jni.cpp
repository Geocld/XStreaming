// JNI entry points for com.lsfg.android.session.NativeBridge.
//
// Phase 3: extractShaders extracts DXBC resources and writes SPIR-V to disk.
// Phase 4: probeShaders validates that every cached SPIR-V blob is accepted by
// the device driver via vkCreateShaderModule.
// Phase 5: initContext / pushFrame / setOutputSurface / destroyContext wire
// the LSFG_3_1 Vulkan pipeline through the AHB bridge.

#include "android_shader_loader.hpp"
#include "android_vk_probe.hpp"
#include "crash_reporter.hpp"
#include "lsfg_render_loop.hpp"
#include "nnapi_npu.hpp"

#include <android/hardware_buffer_jni.h>
#include <android/native_window_jni.h>
#include <jni.h>

#include <string>

namespace {

constexpr const char *kVersion = "lsfg-android 0.1.2";

std::string jstring_to_std(JNIEnv *env, jstring s) {
    if (s == nullptr) {
        return {};
    }
    const char *chars = env->GetStringUTFChars(s, nullptr);
    std::string out = chars ? chars : "";
    if (chars) {
        env->ReleaseStringUTFChars(s, chars);
    }
    return out;
}

} // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_com_lsfg_android_session_NativeBridge_nativeVersion(JNIEnv *env, jobject /*thiz*/) {
    return env->NewStringUTF(kVersion);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_initCrashReporter(
        JNIEnv *env, jobject /*thiz*/, jstring crashPath, jstring logPath) {
    lsfg_android::init_crash_reporter(
        jstring_to_std(env, crashPath),
        jstring_to_std(env, logPath));
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setVerboseLogging(
        JNIEnv * /*env*/, jobject /*thiz*/, jboolean enabled) {
    lsfg_android::set_verbose_logging(enabled == JNI_TRUE);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_lsfg_android_session_NativeBridge_extractShaders(
        JNIEnv *env, jobject /*thiz*/,
        jstring dllPath, jstring /*dllSha256*/, jstring cacheDir) {
    const std::string path = jstring_to_std(env, dllPath);
    const std::string cache = jstring_to_std(env, cacheDir);
    if (path.empty() || cache.empty()) {
        return lsfg_android::kErrDllUnreadable;
    }
    return lsfg_android::extract_dll_to_spirv(path, cache);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_lsfg_android_session_NativeBridge_probeShaders(
        JNIEnv *env, jobject /*thiz*/, jstring cacheDir) {
    return lsfg_android::probe_shaders_on_device(jstring_to_std(env, cacheDir));
}

extern "C" JNIEXPORT jint JNICALL
Java_com_lsfg_android_session_NativeBridge_initContext(
        JNIEnv *env, jobject /*thiz*/,
        jstring cacheDir, jint width, jint height,
        jint multiplier, jfloat flowScale,
        jboolean performance, jboolean hdr,
        jboolean antiArtifacts, jboolean framegenFp16,
        jboolean npuPostProcessing, jint npuPreset,
        jint npuUpscaleFactor, jfloat npuAmount,
        jfloat npuRadius, jfloat npuThreshold, jboolean npuFp16,
        jboolean cpuPostProcessing, jint cpuPreset,
        jfloat cpuStrength, jfloat cpuSaturation,
        jfloat cpuVibrance, jfloat cpuVignette,
        jboolean gpuPostProcessing, jint gpuStage,
        jint gpuMethod, jfloat gpuUpscaleFactor,
        jfloat gpuSharpness, jfloat gpuStrength,
        jint targetFpsCap, jfloat emaAlpha,
        jfloat outlierRatio, jfloat vsyncSlackMs,
        jint queueDepth) {
    const std::string cache = jstring_to_std(env, cacheDir);
    if (cache.empty() || width <= 0 || height <= 0) {
        return lsfg_android::kErrDllUnreadable;
    }
    // Sanity check: at least one cached SPIR-V file must exist. Without shaders,
    // LSFG_3_1::initialize() will throw inside framegen (we catch it but the
    // pipeline will be useless anyway). Failing fast here gives a cleaner error
    // path back to Kotlin so the service can stay in mirror mode.
    auto probeShader = lsfg_android::load_cached_spirv(cache, 255);
    if (probeShader.empty()) {
        return lsfg_android::kErrMissingResource;
    }
    const lsfg_android::RenderLoopConfig cfg{
        .width = static_cast<uint32_t>(width),
        .height = static_cast<uint32_t>(height),
        .multiplier = static_cast<int>(multiplier),
        .flowScale = static_cast<float>(flowScale),
        .performance = performance == JNI_TRUE,
        .hdr = hdr == JNI_TRUE,
        .antiArtifacts = antiArtifacts == JNI_TRUE,
        .framegenFp16 = framegenFp16 == JNI_TRUE,
        .npuPostProcessing = npuPostProcessing == JNI_TRUE,
        .npuPreset = static_cast<int>(npuPreset),
        .npuUpscaleFactor = static_cast<int>(npuUpscaleFactor),
        .npuAmount = static_cast<float>(npuAmount),
        .npuRadius = static_cast<float>(npuRadius),
        .npuThreshold = static_cast<float>(npuThreshold),
        .npuFp16 = npuFp16 == JNI_TRUE,
        .cpuPostProcessing = cpuPostProcessing == JNI_TRUE,
        .cpuPreset = static_cast<int>(cpuPreset),
        .cpuStrength = static_cast<float>(cpuStrength),
        .cpuSaturation = static_cast<float>(cpuSaturation),
        .cpuVibrance = static_cast<float>(cpuVibrance),
        .cpuVignette = static_cast<float>(cpuVignette),
        .gpuPostProcessing = gpuPostProcessing == JNI_TRUE,
        .gpuStage = static_cast<int>(gpuStage),
        .gpuMethod = static_cast<int>(gpuMethod),
        .gpuUpscaleFactor = static_cast<float>(gpuUpscaleFactor),
        .gpuSharpness = static_cast<float>(gpuSharpness),
        .gpuStrength = static_cast<float>(gpuStrength),
        .targetFpsCap = static_cast<int>(targetFpsCap),
        .emaAlpha = static_cast<float>(emaAlpha),
        .outlierRatio = static_cast<float>(outlierRatio),
        .vsyncSlackMs = static_cast<float>(vsyncSlackMs),
        .queueDepth = static_cast<int>(queueDepth),
    };
    return lsfg_android::initRenderLoop(cache.c_str(), cfg);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_lsfg_android_session_NativeBridge_isNpuAvailable(JNIEnv * /*env*/, jobject /*thiz*/) {
    return lsfg_android::nnapi_has_npu_accelerator() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_lsfg_android_session_NativeBridge_isFramegenFp16Supported(
        JNIEnv *env, jobject /*thiz*/, jstring cacheDir) {
    // Two prerequisites: the GPU has to expose shaderFloat16, AND the FP16
    // SPIR-V cache must already be populated by the DLL extraction step.
    // The UI ANDs them so the toggle appears only when the user can actually
    // enable it without surprises.
    if (!lsfg_android::device_supports_float16()) {
        return JNI_FALSE;
    }
    if (cacheDir == nullptr) {
        return JNI_FALSE;
    }
    const std::string cache = jstring_to_std(env, cacheDir);
    if (cache.empty()) {
        return JNI_FALSE;
    }
    return lsfg_android::fp16_shaders_available(cache) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lsfg_android_session_NativeBridge_getNpuSummary(JNIEnv *env, jobject /*thiz*/) {
    return env->NewStringUTF(lsfg_android::nnapi_npu_summary().c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setOutputSurface(
        JNIEnv *env, jobject /*thiz*/, jobject surface, jint w, jint h) {
    ANativeWindow *win = (surface != nullptr)
        ? ANativeWindow_fromSurface(env, surface)
        : nullptr;
    lsfg_android::setOutputSurface(win, static_cast<uint32_t>(w), static_cast<uint32_t>(h));
    if (win != nullptr) {
        // setOutputSurface has acquired its own reference; release ours.
        ANativeWindow_release(win);
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_pushFrame(
        JNIEnv *env, jobject /*thiz*/, jobject hardwareBuffer, jlong timestampNs) {
    if (hardwareBuffer == nullptr) return;
    AHardwareBuffer *ahb = AHardwareBuffer_fromHardwareBuffer(env, hardwareBuffer);
    lsfg_android::pushFrame(ahb, static_cast<int64_t>(timestampNs));
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lsfg_android_session_NativeBridge_getGeneratedFrameCount(
        JNIEnv * /*env*/, jobject /*thiz*/) {
    return static_cast<jlong>(lsfg_android::getGeneratedFrameCount());
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lsfg_android_session_NativeBridge_getPostedFrameCount(
        JNIEnv * /*env*/, jobject /*thiz*/) {
    return static_cast<jlong>(lsfg_android::getPostedFrameCount());
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lsfg_android_session_NativeBridge_getUniqueCaptureCount(
        JNIEnv * /*env*/, jobject /*thiz*/) {
    return static_cast<jlong>(lsfg_android::getUniqueCaptureCount());
}

extern "C" JNIEXPORT jdouble JNICALL
Java_com_lsfg_android_session_NativeBridge_getAverageQueueMs(
        JNIEnv * /*env*/, jobject /*thiz*/) {
    return static_cast<jdouble>(lsfg_android::getAverageQueueMs());
}

extern "C" JNIEXPORT jdouble JNICALL
Java_com_lsfg_android_session_NativeBridge_getAverageLatencyMs(
        JNIEnv * /*env*/, jobject /*thiz*/) {
    return static_cast<jdouble>(lsfg_android::getAverageLatencyMs());
}

extern "C" JNIEXPORT jint JNICALL
Java_com_lsfg_android_session_NativeBridge_getRecentPostIntervalsNs(
        JNIEnv *env, jobject /*thiz*/, jlongArray outArray) {
    if (outArray == nullptr) return 0;
    const jsize cap = env->GetArrayLength(outArray);
    if (cap <= 0) return 0;
    jlong *buf = env->GetLongArrayElements(outArray, nullptr);
    if (buf == nullptr) return 0;
    static_assert(sizeof(jlong) == sizeof(int64_t), "jlong must be int64_t");
    const uint32_t written = lsfg_android::getRecentPostIntervalsNs(
        reinterpret_cast<int64_t *>(buf), static_cast<uint32_t>(cap));
    env->ReleaseLongArrayElements(outArray, buf, 0);
    return static_cast<jint>(written);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_lsfg_android_session_NativeBridge_getProfileWindowNs(
        JNIEnv *env, jobject /*thiz*/, jlongArray outArray) {
    if (outArray == nullptr) return 0;
    const jsize cap = env->GetArrayLength(outArray);
    if (cap < 6) return 0;
    jlong *buf = env->GetLongArrayElements(outArray, nullptr);
    if (buf == nullptr) return 0;
    static_assert(sizeof(jlong) == sizeof(int64_t), "jlong must be int64_t");
    const uint32_t written = lsfg_android::getProfileWindowNs(
        reinterpret_cast<int64_t *>(buf), static_cast<uint32_t>(cap));
    env->ReleaseLongArrayElements(outArray, buf, 0);
    return static_cast<jint>(written);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setBypass(
        JNIEnv * /*env*/, jobject /*thiz*/, jboolean bypass) {
    lsfg_android::setBypass(bypass == JNI_TRUE);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setAntiArtifacts(
        JNIEnv * /*env*/, jobject /*thiz*/, jboolean enabled) {
    lsfg_android::setAntiArtifacts(enabled == JNI_TRUE);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setVsyncPeriodNs(
        JNIEnv * /*env*/, jobject /*thiz*/, jlong periodNs) {
    lsfg_android::setVsyncPeriodNs(static_cast<int64_t>(periodNs));
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setPacingParams(
        JNIEnv * /*env*/, jobject /*thiz*/,
        jint targetFpsCap, jfloat emaAlpha, jfloat outlierRatio,
        jfloat vsyncSlackMs, jint queueDepth) {
    lsfg_android::setPacingParams(
        static_cast<int>(targetFpsCap),
        static_cast<float>(emaAlpha),
        static_cast<float>(outlierRatio),
        static_cast<float>(vsyncSlackMs),
        static_cast<int>(queueDepth));
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_setShizukuTimingEnabled(
        JNIEnv * /*env*/, jobject /*thiz*/, jboolean enabled) {
    lsfg_android::setShizukuTimingEnabled(enabled == JNI_TRUE);
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_reportShizukuTiming(
        JNIEnv * /*env*/, jobject /*thiz*/,
        jlong timestampNs, jlong frameTimeNs, jlong pacingJitterNs) {
    lsfg_android::reportShizukuTiming(
        static_cast<int64_t>(timestampNs),
        static_cast<int64_t>(frameTimeNs),
        static_cast<int64_t>(pacingJitterNs));
}

extern "C" JNIEXPORT void JNICALL
Java_com_lsfg_android_session_NativeBridge_destroyContext(JNIEnv * /*env*/, jobject /*thiz*/) {
    lsfg_android::shutdownRenderLoop();
}
