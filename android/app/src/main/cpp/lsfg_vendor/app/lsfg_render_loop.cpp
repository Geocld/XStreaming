#include "lsfg_render_loop.hpp"
#include "android_vk_session.hpp"
#include "android_vk_probe.hpp"
#include "ahb_image_bridge.hpp"
#include "android_shader_loader.hpp"
#include "gpu_postprocess.hpp"
#include "nnapi_npu.hpp"
#include "nnapi_postprocess.hpp"
#include "cpu_postprocess.hpp"

#include "lsfg_3_1.hpp"
#include "lsfg_3_1p.hpp"

#include <volk.h>

#include <android/log.h>
#include <android/native_window.h>
#include <android/hardware_buffer.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <mutex>
#include <cstdlib>
#include <string>
#include <thread>
#include <type_traits>
#include <utility>
#include <vector>

#include "crash_reporter.hpp"

#define LOG_TAG "lsfg-vk-loop"
#define LOGE(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_ERROR, __VA_ARGS__)
#define LOGW(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_WARN,  __VA_ARGS__)
#define LOGI(...) ::lsfg_android::ring_logf(LOG_TAG, ANDROID_LOG_INFO,  __VA_ARGS__)

namespace lsfg_android {

namespace {

template <typename T>
unsigned long long log_handle_value(T handle) {
    if constexpr (std::is_pointer_v<T>) {
        return static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(handle));
    } else {
        return static_cast<unsigned long long>(handle);
    }
}

struct State {
    using Clock = std::chrono::steady_clock;

    std::mutex mu;
    bool initialized = false;
    bool performanceMode = false;
    bool framegenInitOk = false;  // tracks whether LSFG_3_1::initialize succeeded
    bool framegenFp16 = false;    // load IDs 304..351 (FP16 SPIR-V) instead of 255..302 (DXBC->SPIR-V)
    bool hdr = false;
    float flowScale = 1.0f;
    int32_t framegenCtxId = -1;
    int multiplier = 2;          // generationCount

    VulkanSession vk{};

    AhbImage inSlot[2]{};        // ping-pong inputs
    uint64_t framesCopied = 0;   // total inputs we've copied into a slot
    uint64_t presentsDone = 0;   // mirrors framegen's internal frameIdx

    // Vulkan swapchain state. When live, blitOutputToWindow takes the
    // GPU-only fast path: vkAcquireNextImageKHR → vkCmdBlitImage from the
    // framegen output AHB → vkQueuePresentKHR. This eliminates the CPU
    // memcpy (AHardwareBuffer_lock(CPU_READ) + ANativeWindow_lock +
    // per-row memcpy) that was the single biggest cost at multiplier ≥ 2.
    //
    // The WSI path is disabled when: the extension chain is missing
    // (hasSwapchain=false), any CPU post-process is active (NPU or CPU
    // filter — both mutate the destination in-place on CPU), or surface
    // creation failed on the current ANativeWindow. In those cases the
    // fallback CPU blit path is used transparently.
    struct SwapchainState {
        VkSurfaceKHR surface = VK_NULL_HANDLE;
        VkSwapchainKHR swapchain = VK_NULL_HANDLE;
        VkExtent2D extent{};
        VkFormat format = VK_FORMAT_UNDEFINED;
        std::vector<VkImage> images;
        // One acquire semaphore per slot, cycled round-robin. Vulkan spec
        // forbids reusing a semaphore until the corresponding acquire has
        // completed; N+1 is the safe lower bound.
        std::vector<VkSemaphore> acquireSems;
        // One render-done semaphore per swapchain image (vkQueuePresentKHR
        // waits on the image's semaphore before presenting).
        std::vector<VkSemaphore> renderSems;
        uint32_t acquireCursor = 0;
        bool outOfDate = false;
        // Set when an attempt to build the swapchain failed (e.g. the compute
        // queue family cannot present, or the surface rejects TRANSFER_DST
        // usage). Once set we stop retrying for the rest of the session and
        // use the CPU blit path exclusively. Cleared by destroySwapchain()
        // so a surface re-attach gets a fresh attempt.
        bool disabledForSession = false;
    } swap;
    // ANativeWindow width/height the swapchain was built for. When the
    // overlay reshapes (rare, mostly on orientation change), we recreate.
    uint32_t swapWinW = 0;
    uint32_t swapWinH = 0;
    std::atomic<bool> bypass{false}; // skip framegen, blit raw input
    // Auto-bypass triggered when framegen returns VK_ERROR_DEVICE_LOST during
    // presentContext. Distinct from the user-controlled `bypass` so the user
    // toggle isn't silently flipped by a recoverable driver event. Cleared on
    // every initRenderLoop / context recreation — if the next session
    // succeeds, framegen runs again. Stuck-on means the next presentContext
    // would error too, so passthrough is the right behaviour anyway.
    std::atomic<bool> framegenAutoDisabled{false};
    std::atomic<bool> antiArtifacts{false};
    bool npuPostProcessing = false;
    int npuPreset = 0;
    int npuUpscaleFactor = 1;
    float npuAmount = 0.5f;
    float npuRadius = 1.0f;
    float npuThreshold = 0.0f;
    bool npuFp16 = true;
    NnapiPostProcessor npuPost{};
    bool cpuPostProcessing = false;
    int cpuPreset = 0;
    float cpuStrength = 0.5f;
    float cpuSaturation = 0.5f;
    float cpuVibrance = 0.0f;
    float cpuVignette = 0.0f;
    CpuPostProcessor cpuPost{};
    bool gpuPostProcessing = false;
    int gpuStage = 1;
    int gpuMethod = 0;
    float gpuUpscaleFactor = 1.0f;
    float gpuSharpness = 0.5f;
    float gpuStrength = 0.5f;
    bool gpuNoopLogged = false;
    AhbImage gpuPostImage{};
    GpuPostProcessor gpuPost{};
    std::vector<AhbImage> outputs; // multiplier-many outputs

    // Output surface for the final blit. Owned (acquired from JNI).
    ANativeWindow *outWindow = nullptr;
    uint32_t outWidth = 0;
    uint32_t outHeight = 0;
    // Once we have produced a CPU buffer on this ANativeWindow (via
    // ANativeWindow_lock / setBuffersGeometry), the BufferQueue is bound to a
    // CPU producer. Mali (Bifrost/Valhall) and many other drivers will then
    // return VK_ERROR_NATIVE_WINDOW_IN_USE_KHR (-1000000001) for any subsequent
    // vkCreateAndroidSurfaceKHR on the same native window — the producer slot
    // can't be retargeted live. We track this taint per-attached window and
    // skip the WSI swapchain attempt entirely, avoiding the spammy retries seen
    // on Mali-G57 and the cascade where a failed surface creation correlates
    // with a DEVICE_LOST on framegen's compute queue. Reset on each
    // setOutputSurface(win) call, since a freshly-acquired ANativeWindow has
    // no producer yet.
    bool windowCpuProducerLocked = false;
    // Last geometry successfully passed to ANativeWindow_setBuffersGeometry.
    // We guard the call so it only fires when parameters actually change —
    // calling it on every blit triggers a SurfaceTexture buffer-queue
    // reconfiguration on some drivers that discards queued frames, leaving
    // the display frozen on the first posted frame.
    uint32_t winGeomW = 0;
    uint32_t winGeomH = 0;
    int      winGeomFmt = 0;
    // Feedback-loop gate: suppresses blits when framegen output luma is very
    // dark, indicating setSkipScreenshot failed and MediaProjection is capturing
    // the overlay instead of the game.  Keeping the overlay transparent lets the
    // next capture see the real game and breaks the loop.
    bool     lumaGateOpen      = false;
    uint32_t lumaGateDarkCount = 0;
    int64_t  lumaGateStartNs   = 0; // steady_clock ns at first suppressed dark frame

    // Pending frames to process. We acquire a ref on the AHB so it survives
    // beyond the caller's Image.close(). Drained by the worker thread.
    struct PendingFrame {
        AHardwareBuffer *ahb = nullptr;
        Clock::time_point queuedAt{};
        int64_t captureTimestampNs = 0;
    };
    std::deque<PendingFrame> pending;
    std::condition_variable pendingCv;
    bool stopRequested = false;

    std::thread worker;
    std::atomic<uint64_t> generatedFrames{0};
    // Counts every successful post (CPU blit or WSI present) to the overlay.
    // This is the ground-truth "frames on screen" metric — includes real
    // captures AND LSFG-generated frames. Used by the HUD total-fps counter
    // instead of the old `capturedFps + genFps` which double-counted.
    std::atomic<uint64_t> postedFrames{0};
    // Counts input frames accepted by the render loop. The original LSFG app
    // uses this as a "unique capture" counter because MediaProjection can
    // deliver duplicate 120 Hz buffers for a 60 Hz game. PeaSyo feeds decoded
    // video frames instead; applying duplicate suppression here drops valid
    // stream frames and destabilises motion interpolation.
    std::atomic<uint64_t> uniqueCaptures{0};

    // Ring buffer of recent post timestamps (ns from CLOCK_MONOTONIC, via
    // steady_clock). Consumed by the HUD frame-pacing graph to show real
    // frame-to-frame intervals instead of rolling counts.
    static constexpr size_t kPostRingSize = 128;
    std::atomic<uint64_t> postRingTimestamps[kPostRingSize]{};
    std::atomic<uint64_t> postRingHead{0};

    std::atomic<uint32_t> pushLogCount{0};
    std::atomic<uint32_t> blitLogCount{0};

    // Snapshot of the last completed kProfileWindow rolling window. Updated
    // atomically by the worker thread when a window closes (see workerThread,
    // ProfileAccum). Layout: [copyNs, presentNs, waitIdleNs, blitNs, totalNs,
    // samples]. Each value is the SUM over the window — divide by samples to
    // get the per-frame average. samples == 0 means no window has completed
    // since session start.
    std::atomic<int64_t> profileSnapshotCopyNs{0};
    std::atomic<int64_t> profileSnapshotPresentNs{0};
    std::atomic<int64_t> profileSnapshotWaitIdleNs{0};
    std::atomic<int64_t> profileSnapshotBlitNs{0};
    std::atomic<int64_t> profileSnapshotTotalNs{0};
    std::atomic<int64_t> profileSnapshotQueueNs{0};
    std::atomic<int64_t> profileSnapshotLatencyNs{0};
    std::atomic<int64_t> profileSnapshotBlitCount{0};
    std::atomic<int64_t> profileSnapshotSamples{0};
    std::atomic<bool> shizukuTimingEnabled{false};
    std::atomic<int64_t> shizukuSampleTimestampNs{0};
    std::atomic<int64_t> shizukuFrameTimeNs{0};
    std::atomic<int64_t> shizukuPacingJitterNs{0};

    // Display vsync period in ns (0 = unknown, falls back to plain sleep_until).
    // Set from Kotlin via setVsyncPeriodNs() once the overlay surface reports
    // its refresh rate (OverlayManager.requestedRefreshRateHz).
    std::atomic<int64_t> vsyncPeriodNs{0};

    // User-tunable pacing parameters. Read on every pacing iteration so changes
    // via setPacingParams() take effect without a context re-init.
    std::atomic<int> targetFpsCapHz{0};      // 0 = unlimited
    std::atomic<int64_t> emaAlphaMicro{125000};  // α * 1e6, default 0.125
    std::atomic<int64_t> outlierRatioMicro{4000000}; // ratio * 1e6, default 4.0
    std::atomic<int64_t> vsyncSlackNs{2'000'000};    // default 2 ms
    std::atomic<int> queueDepth{4};
};

State g{};

struct ShizukuTimingSample {
    bool enabled = false;
    int64_t timestampNs = 0;
    int64_t frameTimeNs = 0;
    int64_t pacingJitterNs = 0;
};

struct OutputWindowSnapshot {
    ANativeWindow *window = nullptr;
    uint32_t width = 0;
    uint32_t height = 0;
    bool cpuProducerLocked = false;

    OutputWindowSnapshot() = default;
    OutputWindowSnapshot(const OutputWindowSnapshot &) = delete;
    OutputWindowSnapshot &operator=(const OutputWindowSnapshot &) = delete;

    OutputWindowSnapshot(OutputWindowSnapshot &&other) noexcept {
        *this = std::move(other);
    }

    OutputWindowSnapshot &operator=(OutputWindowSnapshot &&other) noexcept {
        if (this != &other) {
            reset();
            window = other.window;
            width = other.width;
            height = other.height;
            cpuProducerLocked = other.cpuProducerLocked;
            other.window = nullptr;
            other.width = 0;
            other.height = 0;
            other.cpuProducerLocked = false;
        }
        return *this;
    }

    ~OutputWindowSnapshot() {
        reset();
    }

    void reset() {
        if (window != nullptr) {
            ANativeWindow_release(window);
            window = nullptr;
        }
        width = 0;
        height = 0;
        cpuProducerLocked = false;
    }

    explicit operator bool() const {
        return window != nullptr;
    }
};

OutputWindowSnapshot acquireOutputWindowSnapshot() {
    std::lock_guard<std::mutex> lock(g.mu);
    OutputWindowSnapshot snapshot;
    if (g.outWindow != nullptr) {
        ANativeWindow_acquire(g.outWindow);
        snapshot.window = g.outWindow;
        snapshot.width = g.outWidth;
        snapshot.height = g.outHeight;
        snapshot.cpuProducerLocked = g.windowCpuProducerLocked;
    }
    return snapshot;
}

ShizukuTimingSample loadShizukuTimingSample() {
    return {
        .enabled = g.shizukuTimingEnabled.load(std::memory_order_relaxed),
        .timestampNs = g.shizukuSampleTimestampNs.load(std::memory_order_relaxed),
        .frameTimeNs = g.shizukuFrameTimeNs.load(std::memory_order_relaxed),
        .pacingJitterNs = g.shizukuPacingJitterNs.load(std::memory_order_relaxed),
    };
}

// Apply pacing tunables to `g` with sane clamps. Zero/negative values for
// non-cap fields fall back to defaults so partial updates from JNI can't
// accidentally disable the pacer.
void applyPacingParamsImpl(int targetFpsCap, float emaAlpha, float outlierRatio,
                           float vsyncSlackMs, int queueDepth) {
    if (targetFpsCap < 0) targetFpsCap = 0;
    if (targetFpsCap > 0 && targetFpsCap < 15) targetFpsCap = 15;
    if (targetFpsCap > 240) targetFpsCap = 240;
    g.targetFpsCapHz.store(targetFpsCap, std::memory_order_relaxed);

    if (emaAlpha < 0.05f || emaAlpha > 0.5f || !std::isfinite(emaAlpha)) emaAlpha = 0.125f;
    g.emaAlphaMicro.store(static_cast<int64_t>(emaAlpha * 1'000'000.0), std::memory_order_relaxed);

    if (outlierRatio < 2.0f || outlierRatio > 8.0f || !std::isfinite(outlierRatio)) outlierRatio = 4.0f;
    g.outlierRatioMicro.store(static_cast<int64_t>(outlierRatio * 1'000'000.0), std::memory_order_relaxed);

    if (vsyncSlackMs < 1.0f || vsyncSlackMs > 5.0f || !std::isfinite(vsyncSlackMs)) vsyncSlackMs = 2.0f;
    g.vsyncSlackNs.store(static_cast<int64_t>(vsyncSlackMs * 1'000'000.0), std::memory_order_relaxed);

    if (queueDepth < 2) queueDepth = 2;
    if (queueDepth > 6) queueDepth = 6;
    g.queueDepth.store(queueDepth, std::memory_order_relaxed);
}

float clamp01(float value) {
    return value < 0.0f ? 0.0f : (value > 1.0f ? 1.0f : value);
}

float clampScale(float value) {
    return value < 1.0f ? 1.0f : (value > 2.0f ? 2.0f : value);
}

const char *gpuMethodName(int method) {
    switch (method) {
        case 0: return "FSR1_EASU_RCAS";
        case 1: return "AMD_CAS";
        case 2: return "NVIDIA_NIS";
        case 3: return "LANCZOS";
        case 4: return "BICUBIC";
        case 5: return "BILINEAR";
        case 6: return "CATMULL_ROM";
        case 7: return "MITCHELL_NETRAVALI";
        case 8: return "ANIME4K_ULTRAFAST";
        case 9: return "ANIME4K_RESTORE";
        case 10: return "XBRZ";
        case 11: return "EDGE_DIRECTED";
        case 12: return "UNSHARP_MASK";
        case 13: return "LUMA_SHARPEN";
        case 14: return "CONTRAST_ADAPTIVE";
        case 15: return "DEBAND";
        default: return "FSR1_EASU_RCAS";
    }
}

const char *gpuStageName(int stage) {
    return stage == 0 ? "before_lsfg" : "after_lsfg";
}

bool gpuWantsPreLsfg() {
    return g.gpuPostProcessing && g.gpuStage == 0;
}

bool gpuWantsPostLsfg() {
    return g.gpuPostProcessing && g.gpuStage != 0;
}

void noteGpuShaderPassPending() {
    if (!g.gpuPostProcessing || g.gpuNoopLogged) return;
    g.gpuNoopLogged = true;
    LOGI("GPU method %s active stage=%s scale=%.2f sharp=%.2f strength=%.2f",
         gpuMethodName(g.gpuMethod), gpuStageName(g.gpuStage),
         g.gpuUpscaleFactor, g.gpuSharpness, g.gpuStrength);
}

bool shouldSuppressGeneratedFrames(const AhbImage &prev, const AhbImage &cur) {
    if (prev.ahb == nullptr || cur.ahb == nullptr) return false;
    if (prev.extent.width == 0 || prev.extent.height == 0) return false;
    if (prev.extent.width != cur.extent.width || prev.extent.height != cur.extent.height) {
        return true;
    }

    AHardwareBuffer_Desc prevDesc{};
    AHardwareBuffer_Desc curDesc{};
    AHardwareBuffer_describe(prev.ahb, &prevDesc);
    AHardwareBuffer_describe(cur.ahb, &curDesc);
    if (prevDesc.format != AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM ||
            curDesc.format != AHARDWAREBUFFER_FORMAT_R8G8B8A8_UNORM) {
        return false;
    }

    void *prevPtr = nullptr;
    void *curPtr = nullptr;
    if (AHardwareBuffer_lock(prev.ahb, AHARDWAREBUFFER_USAGE_CPU_READ_RARELY,
            -1, nullptr, &prevPtr) != 0 || prevPtr == nullptr) {
        return false;
    }
    if (AHardwareBuffer_lock(cur.ahb, AHARDWAREBUFFER_USAGE_CPU_READ_RARELY,
            -1, nullptr, &curPtr) != 0 || curPtr == nullptr) {
        AHardwareBuffer_unlock(prev.ahb, nullptr);
        return false;
    }

    constexpr uint32_t kGridX = 32;
    constexpr uint32_t kGridY = 18;
    constexpr uint32_t kLumaDeltaThreshold = 26;
    const uint32_t w = std::min(prevDesc.width, curDesc.width);
    const uint32_t h = std::min(prevDesc.height, curDesc.height);
    const uint32_t prevStride = prevDesc.stride * 4;
    const uint32_t curStride = curDesc.stride * 4;
    const auto *prevBytes = static_cast<const uint8_t *>(prevPtr);
    const auto *curBytes = static_cast<const uint8_t *>(curPtr);

    uint64_t totalDelta = 0;
    uint32_t samples = 0;
    for (uint32_t gy = 0; gy < kGridY; ++gy) {
        const uint32_t y = std::min((gy * h) / kGridY, h - 1);
        for (uint32_t gx = 0; gx < kGridX; ++gx) {
            const uint32_t x = std::min((gx * w) / kGridX, w - 1);
            const uint8_t *a = prevBytes + y * prevStride + x * 4;
            const uint8_t *b = curBytes + y * curStride + x * 4;
            const int prevLuma = (77 * a[0] + 150 * a[1] + 29 * a[2]) >> 8;
            const int curLuma = (77 * b[0] + 150 * b[1] + 29 * b[2]) >> 8;
            totalDelta += static_cast<uint32_t>(std::abs(curLuma - prevLuma));
            samples++;
        }
    }

    AHardwareBuffer_unlock(cur.ahb, nullptr);
    AHardwareBuffer_unlock(prev.ahb, nullptr);
    return samples > 0 && (totalDelta / samples) >= kLumaDeltaThreshold;
}

// Sleep until `deadline`, but if we know the display's vsync period, nudge
// the target to a vsync boundary. `lastPostedAt` is the wall time of the most
// recent ANativeWindow_unlockAndPost call — if the computed deadline lies in
// the same vsync slot as that post, we push it to the NEXT boundary so the
// SurfaceFlinger queue doesn't collapse two buffers onto one flip (which is
// what produces the steady-state "bunched" stutter we see with multiplier≥2).
//
// Returns the (possibly adjusted) wake time so the caller can advance its
// own deadline chain consistently.
State::Clock::time_point sleepUntilVsyncAligned(
        State::Clock::time_point deadline,
        State::Clock::time_point lastPostedAt,
        State::Clock::duration slotBudget) {
    const int64_t periodNs = g.vsyncPeriodNs.load(std::memory_order_relaxed);
    if (periodNs <= 0) {
        std::this_thread::sleep_until(deadline);
        return deadline;
    }
    const auto period = std::chrono::nanoseconds(periodNs);
    // Minimum separation from the last post: one full vsync minus a small
    // slack so we don't undershoot a boundary and still land in the same slot.
    // User-tunable (1..5 ms); 2 ms default is below average kernel wake-up jitter.
    const auto slack = std::chrono::nanoseconds(
        g.vsyncSlackNs.load(std::memory_order_relaxed));
    const auto minSeparatedSlot = period - slack;
    if (slotBudget < minSeparatedSlot) {
        std::this_thread::sleep_until(deadline);
        return deadline;
    }
    const auto earliest = lastPostedAt + period - slack;
    if (deadline < earliest) deadline = earliest;
    std::this_thread::sleep_until(deadline);
    return deadline;
}

// Record a successful post (CPU blit or WSI present) for HUD metrics.
// Increments postedFrames and pushes the current steady-clock timestamp into
// the ring buffer so the pacing graph can compute real inter-frame intervals.
void recordOverlayPost() {
    g.postedFrames.fetch_add(1, std::memory_order_relaxed);
    const uint64_t nowNs = static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            State::Clock::now().time_since_epoch()).count());
    const uint64_t slot = g.postRingHead.fetch_add(1, std::memory_order_relaxed)
                          % State::kPostRingSize;
    g.postRingTimestamps[slot].store(nowNs, std::memory_order_relaxed);
}

// ---- Vulkan swapchain helpers ------------------------------------------------
//
// The swapchain lives on top of the overlay's ANativeWindow and provides the
// GPU-only output path: generated frames are vkCmdBlitImage'd from their AHB
// storage directly into the swapchain image and presented via vkQueuePresentKHR.
// No CPU touch of the pixel data.
//
// DEFAULT OFF. An earlier run on Adreno 840 / Android 14 crashed in a driver
// call during createSwapchain before any of the per-step LOGIs could fire —
// the Adreno compute queue reports `vkGetPhysicalDeviceSurfaceSupportKHR =
// VK_TRUE` but then crashes inside `vkQueuePresentKHR` (known quirk on some
// Qualcomm revisions). Keeping the code path in-tree with aggressive logging
// so future device revisions / validation work can flip this flag without
// another refactor. PeaSyo's frame-generation path needs the same fast output
// route as the LSFG reference app; otherwise every generated frame falls back
// to CPU lock/memcpy/unlock and 2x output is not sustainable.
// Upstream's WSI output path is stable in the standalone LSFG app, but the
// PeaSyo integration presents into a GLSurfaceView/SurfaceTexture consumer
// chain instead of LSFG's original windowing path. After the 0.1.2 sync that
// path regressed into "native loop alive but app-side black screen" sessions
// on real devices while CPU blit remained stable. Keep the swapchain code in
// tree for future re-evaluation, but route the integrated app through the
// proven CPU blit path for now.
constexpr bool kEnableWsiSwapchain = false;

void destroySwapchain() {
    // Must drain every in-flight ring submission before touching the images
    // — the swapchain images are referenced by recorded CBs via barriers and
    // destroying them while those CBs are still executing = SIGSEGV on some
    // drivers (observed on Qualcomm). vkDeviceWaitIdle is the sledgehammer.
    if (g.vk.device != VK_NULL_HANDLE && g.vk.fn.vkDeviceWaitIdle != nullptr) {
        g.vk.fn.vkDeviceWaitIdle(g.vk.device);
    }

    if (g.vk.fn.vkDestroySemaphore != nullptr) {
        for (VkSemaphore s : g.swap.acquireSems) {
            if (s != VK_NULL_HANDLE) g.vk.fn.vkDestroySemaphore(g.vk.device, s, nullptr);
        }
        for (VkSemaphore s : g.swap.renderSems) {
            if (s != VK_NULL_HANDLE) g.vk.fn.vkDestroySemaphore(g.vk.device, s, nullptr);
        }
    }
    g.swap.acquireSems.clear();
    g.swap.renderSems.clear();
    g.swap.images.clear();
    g.swap.acquireCursor = 0;
    g.swap.outOfDate = false;
    g.swap.disabledForSession = false;

    if (g.swap.swapchain != VK_NULL_HANDLE && g.vk.fn.vkDestroySwapchainKHR != nullptr) {
        g.vk.fn.vkDestroySwapchainKHR(g.vk.device, g.swap.swapchain, nullptr);
        g.swap.swapchain = VK_NULL_HANDLE;
    }
    if (g.swap.surface != VK_NULL_HANDLE && g.vk.instance != VK_NULL_HANDLE) {
        if (g.vk.pfnDestroySurfaceKHR != nullptr) {
            g.vk.pfnDestroySurfaceKHR(g.vk.instance, g.swap.surface, nullptr);
        } else {
            LOGW("destroySwapchain: pfnDestroySurfaceKHR missing, leaking surface handle");
        }
        g.swap.surface = VK_NULL_HANDLE;
    }
    g.swap.extent = {0, 0};
    g.swap.format = VK_FORMAT_UNDEFINED;
}

// Build (or rebuild) the swapchain on the current outWindow. Returns true if
// the WSI path is live after this call; false means the caller must fall back
// to the CPU blit path for this session.
//
// Safe to call multiple times; previous swapchain is torn down first.
bool createSwapchain() {
    OutputWindowSnapshot outputWindow = acquireOutputWindowSnapshot();
    LOGI("createSwapchain: enter outWindow=%p hasSwapchain=%d enable=%d cpuTainted=%d",
         static_cast<void *>(outputWindow.window), (int)g.vk.hasSwapchain,
         (int)kEnableWsiSwapchain, (int)outputWindow.cpuProducerLocked);
    destroySwapchain();
    if (!kEnableWsiSwapchain) return false;
    if (!g.vk.hasSwapchain) return false;
    if (!outputWindow) return false;
    if (g.vk.instance == VK_NULL_HANDLE) return false;
    // Once the worker has produced any CPU buffer on this ANativeWindow
    // (overlay clear, CPU blit fallback, etc.) the BufferQueue is locked to
    // a CPU producer and vkCreateAndroidSurfaceKHR will return
    // VK_ERROR_NATIVE_WINDOW_IN_USE_KHR (-1000000001) on Mali / many other
    // drivers. Don't even attempt — failed surface creation has been observed
    // to correlate with framegen-side DEVICE_LOST on Mali-G57 (likely an
    // instance-level state corruption when the WSI driver path bails late).
    if (outputWindow.cpuProducerLocked) {
        LOGI("createSwapchain: skipping — window already bound to CPU producer this session");
        return false;
    }
    // Use the session-cached function pointer instead of volk's global. The
    // global gets clobbered to NULL when framegen's Instance::Instance()
    // calls volkLoadInstance() against its own surface-less VkInstance,
    // because that instance can't resolve vkCreateAndroidSurfaceKHR. The
    // session pointer was resolved against OUR instance at session-init time
    // and survives that overwrite.
    PFN_vkCreateAndroidSurfaceKHR pfnCreateSurface = g.vk.pfnCreateAndroidSurfaceKHR;
    if (pfnCreateSurface == nullptr) pfnCreateSurface = vkCreateAndroidSurfaceKHR;
    if (pfnCreateSurface == nullptr) {
        LOGW("vkCreateAndroidSurfaceKHR fn ptr is NULL — volk didn't load it");
        return false;
    }

    LOGI("createSwapchain: calling vkCreateAndroidSurfaceKHR");
    const VkAndroidSurfaceCreateInfoKHR sci{
        .sType = VK_STRUCTURE_TYPE_ANDROID_SURFACE_CREATE_INFO_KHR,
        .window = outputWindow.window,
    };
    const VkResult sres = pfnCreateSurface(g.vk.instance, &sci, nullptr, &g.swap.surface);
    if (sres != VK_SUCCESS) {
        // VK_ERROR_NATIVE_WINDOW_IN_USE_KHR means the ANativeWindow is locked
        // to a CPU producer (or another consumer). The state is sticky — no
        // amount of retrying on the same window will recover. Pin the taint
        // so subsequent createSwapchain calls bail at the early gate above
        // instead of repeating the same failed driver call (which on some
        // Mali / Adreno revisions can leave the instance in a tainted state
        // and induce a DEVICE_LOST on framegen's separate device).
        if (sres == VK_ERROR_NATIVE_WINDOW_IN_USE_KHR) {
            g.windowCpuProducerLocked = true;
            LOGW("vkCreateAndroidSurfaceKHR: window in use by CPU producer (rc=%d) — WSI disabled for this surface; using CPU blit",
                 (int)sres);
        } else {
            LOGW("vkCreateAndroidSurfaceKHR failed (rc=%d) — falling back to CPU blit", (int)sres);
        }
        g.swap.surface = VK_NULL_HANDLE;
        return false;
    }
    LOGI("createSwapchain: surface=0x%llx", log_handle_value(g.swap.surface));

    // Can our compute queue actually present on this surface?
    if (g.vk.pfnGetPhysicalDeviceSurfaceSupportKHR == nullptr ||
        g.vk.pfnGetPhysicalDeviceSurfaceCapabilitiesKHR == nullptr ||
        g.vk.pfnGetPhysicalDeviceSurfaceFormatsKHR == nullptr) {
        LOGW("createSwapchain: WSI instance function cache incomplete");
        destroySwapchain();
        return false;
    }

    VkBool32 canPresent = VK_FALSE;
    const VkResult suppr = g.vk.pfnGetPhysicalDeviceSurfaceSupportKHR(
        g.vk.physicalDevice, g.vk.computeFamilyIdx, g.swap.surface, &canPresent);
    LOGI("createSwapchain: surfaceSupport rc=%d canPresent=%d", (int)suppr, (int)canPresent);
    if (suppr != VK_SUCCESS || canPresent != VK_TRUE) {
        LOGW("compute queue family %u cannot present on this surface — fall back to CPU blit",
             g.vk.computeFamilyIdx);
        destroySwapchain();
        return false;
    }

    VkSurfaceCapabilitiesKHR caps{};
    if (g.vk.pfnGetPhysicalDeviceSurfaceCapabilitiesKHR(
            g.vk.physicalDevice, g.swap.surface, &caps) != VK_SUCCESS) {
        LOGW("vkGetPhysicalDeviceSurfaceCapabilitiesKHR failed");
        destroySwapchain();
        return false;
    }

    // Format: prefer RGBA8 UNORM since that's what framegen outputs. Fall back
    // to whatever the driver offers if not present.
    uint32_t fmtCount = 0;
    g.vk.pfnGetPhysicalDeviceSurfaceFormatsKHR(g.vk.physicalDevice, g.swap.surface,
                                               &fmtCount, nullptr);
    std::vector<VkSurfaceFormatKHR> fmts(fmtCount);
    if (fmtCount > 0) {
        g.vk.pfnGetPhysicalDeviceSurfaceFormatsKHR(g.vk.physicalDevice, g.swap.surface,
                                                   &fmtCount, fmts.data());
    }
    VkSurfaceFormatKHR chosen{VK_FORMAT_R8G8B8A8_UNORM, VK_COLORSPACE_SRGB_NONLINEAR_KHR};
    bool haveChosen = false;
    for (const auto &f : fmts) {
        if (f.format == VK_FORMAT_R8G8B8A8_UNORM ||
            f.format == VK_FORMAT_R8G8B8A8_SRGB) {
            chosen = f;
            haveChosen = true;
            break;
        }
    }
    if (!haveChosen && !fmts.empty()) chosen = fmts.front();

    // Present mode: FIFO is the only guaranteed mode and is exactly what we
    // want — the pacing loop already emits frames at their target slots, and
    // FIFO gives us a vsync-bounded queue. MAILBOX would let frames drop,
    // which defeats the purpose of the generated-frame schedule.
    VkPresentModeKHR presentMode = VK_PRESENT_MODE_FIFO_KHR;

    // SurfaceView-backed windows on some OEM stacks report a rotated current
    // transform (most commonly ROTATE_90) even though the stream content and
    // the attached ANativeWindow dimensions are already landscape-correct.
    // Passing that transform through to the swapchain makes the compositor
    // rotate the presented image again, which shows up exactly as "90 degree
    // rotated and stretched". The legacy CPU blit path does not suffer from
    // this because ANativeWindow_lock writes directly into the consumer's
    // expected orientation. Until we have a fully verified WSI transform path
    // for the in-app SurfaceView case, fall back to CPU blit whenever the
    // surface asks for a non-identity transform.
    if (caps.currentTransform != VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR) {
        LOGW("swapchain surface currentTransform=0x%x is non-identity — falling back to CPU blit",
             static_cast<unsigned>(caps.currentTransform));
        destroySwapchain();
        return false;
    }

    // Image count: 3 gives a comfortable buffer under FIFO (acquire can run
    // ahead by one while SurfaceFlinger holds the currently-displayed image).
    uint32_t imageCount = caps.minImageCount + 1;
    if (caps.maxImageCount > 0 && imageCount > caps.maxImageCount) {
        imageCount = caps.maxImageCount;
    }
    if (imageCount < 2) imageCount = 2;

    VkExtent2D extent = caps.currentExtent;
    if (extent.width == 0 || extent.width == UINT32_MAX) {
        extent.width = outputWindow.width > 0 ? outputWindow.width : 1920;
    }
    if (extent.height == 0 || extent.height == UINT32_MAX) {
        extent.height = outputWindow.height > 0 ? outputWindow.height : 1080;
    }

    // TRANSFER_DST is mandatory for vkCmdBlitImage into the swapchain images.
    // Some drivers require explicit opt-in via capabilities.supportedUsageFlags.
    if ((caps.supportedUsageFlags & VK_IMAGE_USAGE_TRANSFER_DST_BIT) == 0) {
        LOGW("swapchain surface does not advertise TRANSFER_DST usage — falling back to CPU blit");
        destroySwapchain();
        return false;
    }

    const VkSwapchainCreateInfoKHR sci2{
        .sType = VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR,
        .surface = g.swap.surface,
        .minImageCount = imageCount,
        .imageFormat = chosen.format,
        .imageColorSpace = chosen.colorSpace,
        .imageExtent = extent,
        .imageArrayLayers = 1,
        .imageUsage = VK_IMAGE_USAGE_TRANSFER_DST_BIT,
        .imageSharingMode = VK_SHARING_MODE_EXCLUSIVE,
        .preTransform = VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR,
        .compositeAlpha = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR,
        .presentMode = presentMode,
        .clipped = VK_TRUE,
    };
    LOGI("createSwapchain: vkCreateSwapchainKHR fmt=%d extent=%ux%u imageCount=%u",
         (int)chosen.format, extent.width, extent.height, imageCount);
    if (g.vk.fn.vkCreateSwapchainKHR == nullptr) {
        LOGW("vkCreateSwapchainKHR fn ptr is NULL");
        destroySwapchain();
        return false;
    }
    if (g.vk.fn.vkCreateSwapchainKHR(g.vk.device, &sci2, nullptr,
            &g.swap.swapchain) != VK_SUCCESS) {
        LOGW("vkCreateSwapchainKHR failed");
        destroySwapchain();
        return false;
    }
    LOGI("createSwapchain: swapchain=0x%llx", log_handle_value(g.swap.swapchain));

    uint32_t realCount = 0;
    g.vk.fn.vkGetSwapchainImagesKHR(g.vk.device, g.swap.swapchain, &realCount, nullptr);
    g.swap.images.resize(realCount);
    g.vk.fn.vkGetSwapchainImagesKHR(g.vk.device, g.swap.swapchain, &realCount,
                                    g.swap.images.data());

    // Semaphore pools:
    //   acquireSems: one per "in-flight frame" slot (we use realCount + 1)
    //   renderSems:  one per swapchain image (vkQueuePresent waits on this
    //                semaphore for the specific image we rendered to)
    g.swap.acquireSems.resize(realCount + 1, VK_NULL_HANDLE);
    g.swap.renderSems.resize(realCount, VK_NULL_HANDLE);
    const VkSemaphoreCreateInfo semInfo{
        .sType = VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO,
    };
    for (auto &s : g.swap.acquireSems) {
        if (g.vk.fn.vkCreateSemaphore(g.vk.device, &semInfo, nullptr, &s) != VK_SUCCESS) {
            LOGW("vkCreateSemaphore(acquire) failed");
            destroySwapchain();
            return false;
        }
    }
    for (auto &s : g.swap.renderSems) {
        if (g.vk.fn.vkCreateSemaphore(g.vk.device, &semInfo, nullptr, &s) != VK_SUCCESS) {
            LOGW("vkCreateSemaphore(render) failed");
            destroySwapchain();
            return false;
        }
    }

    g.swap.extent = extent;
    g.swap.format = chosen.format;
    g.swap.acquireCursor = 0;
    g.swap.outOfDate = false;
    LOGI("Swapchain ready: %ux%u fmt=%d images=%u mode=FIFO",
         extent.width, extent.height, (int)chosen.format, realCount);
    return true;
}

// Blit `src` AHB-backed VkImage to the next swapchain image and present.
// Returns true on success. On VK_ERROR_OUT_OF_DATE_KHR or _SUBOPTIMAL_KHR the
// swapchain is marked dirty; the caller's next blit will recreate it.
bool blitOutputToSwapchain(const AhbImage &src) {
    if (g.swap.swapchain == VK_NULL_HANDLE) return false;
    if (src.image == VK_NULL_HANDLE) return false;
    if (g.swap.outOfDate) {
        if (!createSwapchain()) return false;
    }
    if (g.swap.acquireSems.empty()) return false;

    // Pick an acquire semaphore from the round-robin pool. Using a single
    // semaphore risks "semaphore already has a pending wait" on fast backs.
    VkSemaphore acquireSem = g.swap.acquireSems[g.swap.acquireCursor];
    g.swap.acquireCursor = (g.swap.acquireCursor + 1) % g.swap.acquireSems.size();

    uint32_t imageIdx = 0;
    const VkResult ar = g.vk.fn.vkAcquireNextImageKHR(g.vk.device, g.swap.swapchain,
        500ULL * 1'000'000ULL,  // 500 ms: generous — SurfaceFlinger normally returns in <16ms
        acquireSem, VK_NULL_HANDLE, &imageIdx);
    if (ar == VK_ERROR_OUT_OF_DATE_KHR) {
        g.swap.outOfDate = true;
        return false;
    }
    if (ar != VK_SUCCESS && ar != VK_SUBOPTIMAL_KHR) {
        LOGW("vkAcquireNextImageKHR returned %d", (int)ar);
        return false;
    }
    if (imageIdx >= g.swap.images.size()) {
        LOGW("vkAcquireNextImageKHR returned OOB index %u (size %zu)",
             imageIdx, g.swap.images.size());
        return false;
    }

    VkCommandBuffer cb = VK_NULL_HANDLE;
    VkFence fence = VK_NULL_HANDLE;
    if (!acquireCommandRing(g.vk, cb, fence)) return false;
    const VkCommandBufferBeginInfo bi{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
    };
    g.vk.fn.vkBeginCommandBuffer(cb, &bi);

    // Source: AHB-backed image owned by framegen's device between uses.
    // Acquire for TRANSFER_READ, release back to EXTERNAL after blit.
    const uint32_t foreign = VK_QUEUE_FAMILY_EXTERNAL;
    VkImageMemoryBarrier srcAcquire{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        .srcQueueFamilyIndex = foreign,
        .dstQueueFamilyIndex = g.vk.computeFamilyIdx,
        .image = src.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    // Destination: swapchain image. Start UNDEFINED → TRANSFER_DST, blit,
    // then → PRESENT_SRC so SurfaceFlinger can pick it up.
    VkImageMemoryBarrier dstToTransfer{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .newLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .image = g.swap.images[imageIdx],
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier pre[2] = {srcAcquire, dstToTransfer};
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT,
        0, 0, nullptr, 0, nullptr, 2, pre);

    static std::atomic<bool> loggedBlitMode{false};
    if (!loggedBlitMode.exchange(true, std::memory_order_relaxed)) {
        LOGI("blitOutputToSwapchain: using vkCmdBlitImage path %ux%u -> %ux%u",
             src.extent.width, src.extent.height,
             g.swap.extent.width, g.swap.extent.height);
    }
    const VkImageBlit region{
        .srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1},
        .srcOffsets = {{0, 0, 0}, {
            static_cast<int32_t>(src.extent.width),
            static_cast<int32_t>(src.extent.height), 1,
        }},
        .dstSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1},
        .dstOffsets = {{0, 0, 0}, {
            static_cast<int32_t>(g.swap.extent.width),
            static_cast<int32_t>(g.swap.extent.height), 1,
        }},
    };
    g.vk.fn.vkCmdBlitImage(cb,
        src.image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        g.swap.images[imageIdx], VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        1, &region, VK_FILTER_LINEAR);

    VkImageMemoryBarrier srcRelease{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
        .dstAccessMask = 0,
        .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        .newLayout = VK_IMAGE_LAYOUT_GENERAL,
        .srcQueueFamilyIndex = g.vk.computeFamilyIdx,
        .dstQueueFamilyIndex = foreign,
        .image = src.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier dstToPresent{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .dstAccessMask = 0,
        .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        .newLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
        .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .image = g.swap.images[imageIdx],
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier post[2] = {srcRelease, dstToPresent};
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT,
        0, 0, nullptr, 0, nullptr, 2, post);

    g.vk.fn.vkEndCommandBuffer(cb);

    VkSemaphore renderSem = g.swap.renderSems[imageIdx];
    const VkPipelineStageFlags waitStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
    const VkSubmitInfo si{
        .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
        .waitSemaphoreCount = 1,
        .pWaitSemaphores = &acquireSem,
        .pWaitDstStageMask = &waitStage,
        .commandBufferCount = 1,
        .pCommandBuffers = &cb,
        .signalSemaphoreCount = 1,
        .pSignalSemaphores = &renderSem,
    };
    if (g.vk.fn.vkQueueSubmit(g.vk.computeQueue, 1, &si, fence) != VK_SUCCESS) {
        LOGW("vkQueueSubmit(swapchain blit) failed");
        return false;
    }
    // Arm the ring fence manually — submitCommandRing would have done this
    // but we bypassed it to add the semaphore wait/signal pair.
    for (uint32_t i = 0; i < kCommandRingSize; ++i) {
        if (g.vk.ringFences[i] == fence) {
            g.vk.ringFenceArmed[i] = true;
            break;
        }
    }

    const VkPresentInfoKHR pi{
        .sType = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR,
        .waitSemaphoreCount = 1,
        .pWaitSemaphores = &renderSem,
        .swapchainCount = 1,
        .pSwapchains = &g.swap.swapchain,
        .pImageIndices = &imageIdx,
    };
    const VkResult pr = g.vk.fn.vkQueuePresentKHR(g.vk.computeQueue, &pi);
    if (pr == VK_ERROR_OUT_OF_DATE_KHR || pr == VK_SUBOPTIMAL_KHR) {
        // Note for next pass — don't fall back this frame (we already posted).
        g.swap.outOfDate = true;
        recordOverlayPost();
    } else if (pr != VK_SUCCESS) {
        LOGW("vkQueuePresentKHR returned %d", (int)pr);
    } else {
        recordOverlayPost();
    }
    return true;
}

// Transition a freshly-created AHB-backed inSlot image UNDEFINED→GENERAL
// and release ownership to VK_QUEUE_FAMILY_EXTERNAL. This must be called once
// per inSlot after createAhbImage so that every subsequent copyAhbImage can
// acquire with oldLayout=GENERAL, preserving Mali AFRC state across frames.
void initInSlotImageLayout(VkImage image) {
    VkCommandBufferAllocateInfo cbai{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
        .commandPool = g.vk.commandPool,
        .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        .commandBufferCount = 1,
    };
    VkCommandBuffer cb = VK_NULL_HANDLE;
    if (g.vk.fn.vkAllocateCommandBuffers(g.vk.device, &cbai, &cb) != VK_SUCCESS) {
        LOGE("initInSlotImageLayout: vkAllocateCommandBuffers failed");
        return;
    }
    const VkCommandBufferBeginInfo bi{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
    };
    g.vk.fn.vkBeginCommandBuffer(cb, &bi);
    // Transition UNDEFINED→GENERAL and release to EXTERNAL in one barrier.
    const VkImageMemoryBarrier barrier{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = 0,
        .oldLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .newLayout = VK_IMAGE_LAYOUT_GENERAL,
        .srcQueueFamilyIndex = g.vk.computeFamilyIdx,
        .dstQueueFamilyIndex = VK_QUEUE_FAMILY_EXTERNAL,
        .image = image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,
        VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT,
        0, 0, nullptr, 0, nullptr, 1, &barrier);
    g.vk.fn.vkEndCommandBuffer(cb);
    const VkSubmitInfo si{
        .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
        .commandBufferCount = 1,
        .pCommandBuffers = &cb,
    };
    g.vk.fn.vkQueueSubmit(g.vk.computeQueue, 1, &si, VK_NULL_HANDLE);
    g.vk.fn.vkQueueWaitIdle(g.vk.computeQueue);
    g.vk.fn.vkFreeCommandBuffers(g.vk.device, g.vk.commandPool, 1, &cb);
    LOGI("initInSlotImageLayout: image=%p initialized to GENERAL/EXTERNAL", (void*)image);
}

// Copy `src` AhbImage into `dst` AhbImage on the compute queue using a
// transient command buffer. Both images are AHB-backed so layouts are
// EXTERNAL initially; we transition to TRANSFER_DST/SRC, copy, transition
// back to GENERAL so framegen can read them.
//
// Uses transient alloc+free per call rather than the session's CB ring:
// on Adreno the per-frame vkAllocateCommandBuffers/vkFreeCommandBuffers
// pair runs in single-digit microseconds, while vkResetCommandBuffer +
// vkWaitForFences (the ring path) was measurably slower in field testing.
bool copyAhbImage(const AhbImage &src, const AhbImage &dst) {
    VkCommandBufferAllocateInfo cbai{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
        .commandPool = g.vk.commandPool,
        .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        .commandBufferCount = 1,
    };
    VkCommandBuffer cb = VK_NULL_HANDLE;
    if (g.vk.fn.vkAllocateCommandBuffers(g.vk.device, &cbai, &cb) != VK_SUCCESS) return false;

    const VkCommandBufferBeginInfo bi{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
    };
    g.vk.fn.vkBeginCommandBuffer(cb, &bi);

    // Per VK_ANDROID_external_memory_android_hardware_buffer: AHB-backed
    // images are conceptually owned by the FOREIGN_EXT queue family between
    // uses. Both src (just received from MediaProjection / ImageReader) and
    // dst (last touched by framegen on its own device) must be acquired from
    // FOREIGN_EXT before our compute queue can touch them — this is what
    // tells the driver "the foreign side is done writing, copy what's there".
    // Keep the Android-side session aligned with framegen's AHB import path:
    // both devices transfer ownership through the generic EXTERNAL family.
    const uint32_t foreign = VK_QUEUE_FAMILY_EXTERNAL;
    VkImageMemoryBarrier toSrc{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        .srcQueueFamilyIndex = foreign,
        .dstQueueFamilyIndex = g.vk.computeFamilyIdx,
        .image = src.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier toDst{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_GENERAL,     // always GENERAL: set by initInSlotImageLayout and preserved by releaseDst
        .newLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        .srcQueueFamilyIndex = foreign,           // framegen had it last
        .dstQueueFamilyIndex = g.vk.computeFamilyIdx,
        .image = dst.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier preBarriers[2] = {toSrc, toDst};
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT,
        0, 0, nullptr, 0, nullptr, 2, preBarriers);

    const uint32_t w = std::min(src.extent.width,  dst.extent.width);
    const uint32_t h = std::min(src.extent.height, dst.extent.height);
    const VkImageCopy region{
        .srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1},
        .srcOffset = {0, 0, 0},
        .dstSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1},
        .dstOffset = {0, 0, 0},
        .extent = {w, h, 1},
    };
    g.vk.fn.vkCmdCopyImage(cb,
        src.image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        dst.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        1, &region);

    // Release dst back to FOREIGN so framegen (on its own device) can acquire
    // it cleanly via its own image-memory-barrier. We also release the src
    // (we don't need it anymore — destroyAhbImage will tear down our VkImage
    // wrapper, but the AHB itself stays alive in the ImageReader's pool).
    VkImageMemoryBarrier releaseDst{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .dstAccessMask = 0,
        .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        .newLayout = VK_IMAGE_LAYOUT_GENERAL,
        .srcQueueFamilyIndex = g.vk.computeFamilyIdx,
        .dstQueueFamilyIndex = foreign,
        .image = dst.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier releaseSrc{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
        .dstAccessMask = 0,
        .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        .newLayout = VK_IMAGE_LAYOUT_GENERAL,
        .srcQueueFamilyIndex = g.vk.computeFamilyIdx,
        .dstQueueFamilyIndex = foreign,
        .image = src.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier postBarriers[2] = {releaseDst, releaseSrc};
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TRANSFER_BIT,
        VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT,
        0, 0, nullptr, 0, nullptr, 2, postBarriers);

    // Flush GPU L2 to DRAM before the CPU reads via AHardwareBuffer_lock.
    // Mali-G77 does not automatically flush the L2 on vkQueueWaitIdle, so
    // AHardwareBuffer_lock(fence=-1) reads stale zeroes without this barrier.
    const VkMemoryBarrier hostFlush{
        .sType = VK_STRUCTURE_TYPE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .dstAccessMask = VK_ACCESS_HOST_READ_BIT,
    };
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_HOST_BIT,
        0, 1, &hostFlush, 0, nullptr, 0, nullptr);

    g.vk.fn.vkEndCommandBuffer(cb);

    const VkSubmitInfo si{
        .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
        .commandBufferCount = 1,
        .pCommandBuffers = &cb,
    };
    const VkResult qsr = g.vk.fn.vkQueueSubmit(g.vk.computeQueue, 1, &si, VK_NULL_HANDLE);
    if (qsr != VK_SUCCESS) {
        LOGE("copyAhbImage vkQueueSubmit failed: %d dst=%ux%u", (int)qsr,
             dst.extent.width, dst.extent.height);
        g.vk.fn.vkFreeCommandBuffers(g.vk.device, g.vk.commandPool, 1, &cb);
        return false;
    }
    g.vk.fn.vkQueueWaitIdle(g.vk.computeQueue);
    g.vk.fn.vkFreeCommandBuffers(g.vk.device, g.vk.commandPool, 1, &cb);
    return true;
}

bool blitAhbImageGpu(const AhbImage &src, const AhbImage &dst) {
    if (src.image == VK_NULL_HANDLE || dst.image == VK_NULL_HANDLE) return false;
    VkCommandBufferAllocateInfo cbai{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
        .commandPool = g.vk.commandPool,
        .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        .commandBufferCount = 1,
    };
    VkCommandBuffer cb = VK_NULL_HANDLE;
    if (g.vk.fn.vkAllocateCommandBuffers(g.vk.device, &cbai, &cb) != VK_SUCCESS) return false;

    const VkCommandBufferBeginInfo bi{
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
    };
    g.vk.fn.vkBeginCommandBuffer(cb, &bi);

    const uint32_t foreign = VK_QUEUE_FAMILY_EXTERNAL;
    VkImageMemoryBarrier toSrc{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        .srcQueueFamilyIndex = foreign,
        .dstQueueFamilyIndex = g.vk.computeFamilyIdx,
        .image = src.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier toDst{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = 0,
        .dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .newLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        .srcQueueFamilyIndex = foreign,
        .dstQueueFamilyIndex = g.vk.computeFamilyIdx,
        .image = dst.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier preBarriers[2] = {toSrc, toDst};
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT,
        0, 0, nullptr, 0, nullptr, 2, preBarriers);

    const VkImageBlit region{
        .srcSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1},
        .srcOffsets = {{0, 0, 0}, {
            static_cast<int32_t>(src.extent.width),
            static_cast<int32_t>(src.extent.height),
            1,
        }},
        .dstSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1},
        .dstOffsets = {{0, 0, 0}, {
            static_cast<int32_t>(dst.extent.width),
            static_cast<int32_t>(dst.extent.height),
            1,
        }},
    };
    g.vk.fn.vkCmdBlitImage(cb,
        src.image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        dst.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        1, &region, VK_FILTER_LINEAR);

    VkImageMemoryBarrier releaseSrc{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
        .dstAccessMask = 0,
        .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        .newLayout = VK_IMAGE_LAYOUT_GENERAL,
        .srcQueueFamilyIndex = g.vk.computeFamilyIdx,
        .dstQueueFamilyIndex = foreign,
        .image = src.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier releaseDst{
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
        .dstAccessMask = VK_ACCESS_MEMORY_READ_BIT,
        .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
        .newLayout = VK_IMAGE_LAYOUT_GENERAL,
        .srcQueueFamilyIndex = g.vk.computeFamilyIdx,
        .dstQueueFamilyIndex = foreign,
        .image = dst.image,
        .subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1},
    };
    VkImageMemoryBarrier postBarriers[2] = {releaseSrc, releaseDst};
    g.vk.fn.vkCmdPipelineBarrier(cb,
        VK_PIPELINE_STAGE_TRANSFER_BIT,
        VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT,
        0, 0, nullptr, 0, nullptr, 2, postBarriers);

    g.vk.fn.vkEndCommandBuffer(cb);
    const VkSubmitInfo si{
        .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
        .commandBufferCount = 1,
        .pCommandBuffers = &cb,
    };
    const bool ok = g.vk.fn.vkQueueSubmit(g.vk.computeQueue, 1, &si, VK_NULL_HANDLE) == VK_SUCCESS;
    if (ok) g.vk.fn.vkQueueWaitIdle(g.vk.computeQueue);
    g.vk.fn.vkFreeCommandBuffers(g.vk.device, g.vk.commandPool, 1, &cb);
    return ok;
}

bool ensureGpuPostImage(uint32_t width, uint32_t height) {
    if (g.gpuPostImage.ahb != nullptr &&
            g.gpuPostImage.extent.width == width &&
            g.gpuPostImage.extent.height == height) {
        return true;
    }
    destroyAhbImage(g.vk, g.gpuPostImage);
    const int rc = createAhbImage(g.vk, width, height, VK_FORMAT_R8G8B8A8_UNORM,
                                  g.gpuPostImage);
    if (rc != kOk) {
        LOGW("GPU post-process intermediate allocation failed rc=%d size=%ux%u",
             rc, width, height);
        return false;
    }
    return true;
}

bool processRealFrameIntoSlot(const AhbImage &src, const AhbImage &dst) {
    if (!gpuWantsPreLsfg()) {
        return copyAhbImage(src, dst);
    }
    noteGpuShaderPassPending();
    const GpuPostProcessConfig gpuCfg{
        .method = g.gpuMethod,
        .sharpness = g.gpuSharpness,
        .strength = g.gpuStrength,
    };
    if (g.gpuPost.process(g.vk, src, dst, gpuCfg)) {
        return true;
    }
    LOGW("GPU pre-LSFG processing failed; falling back to Vulkan linear blit");
    if (blitAhbImageGpu(src, dst)) {
        return true;
    }
    LOGW("GPU pre-LSFG fallback failed; falling back to raw copy");
    return copyAhbImage(src, dst);
}

bool initFramegen(const char *cacheDir) {
    const std::string cache(cacheDir ? cacheDir : "");

    // There are three shader sources, in order of preference for a given
    // session:
    //
    //   1. FP16 SPIR-V (Lossless.dll IDs 304..351): user-requested half-precision.
    //   2. FP32 SPIR-V (Lossless.dll IDs 353..400): default for a normal session.
    //   3. DXBC translated by dxvk (Lossless.dll IDs 255..302): legacy fallback.
    //
    // Why FP32 SPIR-V is the new default instead of the dxvk-translated DXBC:
    // the bundled dxvk DXBC→SPIR-V compiler (thirdparty/dxbc/src/dxbc/
    // dxbc_compiler.cpp:34) emits `OpCapability VulkanMemoryModel` on EVERY
    // shader. That feature is optional in Vulkan 1.2/1.3 and absent on Mali
    // Bifrost/Valhall (G57/G68/G77) — those drivers silently accept the
    // request at vkCreateDevice time, then DEVICE_LOST on the first compute
    // dispatch (see Mali-G57 field log "presentContext threw: Unable to
    // submit command buffer (error -4)").
    //
    // The precompiled FP32 SPIR-V from the DLL uses `OpMemoryModel Logical
    // GLSL450` with NO VMM capability — verified across the entire 353..400
    // range via _analysis/dump_fp32_spv.py / _analysis/fp32/. Same shader
    // outputs as the DXBC path, no Float16 dependency, and bypasses dxvk
    // entirely. So when both caches are populated, FP32 SPIR-V is strictly a
    // win: same precision, broader device coverage, no translation step.
    const bool fp16Available = fp16_shaders_available(cache);
    const bool fp32SpirvAvailable = fp32_spirv_shaders_available(cache);
    const bool deviceHasVMM = device_supports_vulkan_memory_model();

    bool useFp16 = g.framegenFp16 && fp16Available;
    if (g.framegenFp16 && !useFp16) {
        LOGW("FP16 framegen requested but SPIR-V FP16 cache is incomplete in %s — falling back",
             cache.c_str());
    }

    // Auto-flip to FP16 when the device can't run the dxvk path AND can't run
    // the FP32 SPIR-V path either, but FP16 is available. This is the rescue
    // route for an FP16-only DLL extraction on a Mali device.
    if (!useFp16 && !fp32SpirvAvailable && fp16Available
            && device_supports_float16()
            && !deviceHasVMM) {
        LOGW("Device lacks vulkanMemoryModel and FP32 SPIR-V cache is missing — "
             "auto-forcing FP16 framegen path so dxvk is bypassed.");
        useFp16 = true;
    }

    // Pick FP32 SPIR-V over DXBC whenever both options exist and the user
    // hasn't asked for FP16. On VMM-less devices this is mandatory; on devices
    // that DO support VMM it's still the better default (no dxvk translation
    // cost at session-start, smaller binary surface, identical shader output).
    const bool useFp32Spirv = !useFp16 && fp32SpirvAvailable;
    if (useFp16) {
        LOGI("Loading framegen shaders from FP16 SPIR-V cache (Lossless.dll resource IDs 304..351)");
    } else if (useFp32Spirv) {
        LOGI("Loading framegen shaders from FP32 SPIR-V cache (Lossless.dll resource IDs 353..400) "
             "— bypasses dxvk DXBC translator (deviceVMM=%d)", (int)deviceHasVMM);
    } else {
        LOGI("Loading framegen shaders from DXBC cache (Lossless.dll resource IDs 255..302) "
             "— translated via dxvk; requires vulkanMemoryModel (deviceVMM=%d)",
             (int)deviceHasVMM);
    }

    auto loader = [cache, useFp16, useFp32Spirv](const std::string &name) -> std::vector<uint8_t> {
        // Framegen requests shaders by symbolic name (e.g. "p_mipmaps");
        // we cache them on disk by numeric resource ID. Each of the three
        // sources has its own ID range and on-disk subdirectory, all keyed
        // off the canonical DXBC id via constant offsets.
        uint32_t id = 0;
        ShaderCache source = ShaderCache::Dxbc;
        if (useFp16) {
            id = shader_name_to_resource_id_fp16(name);
            source = ShaderCache::Fp16Spirv;
        } else if (useFp32Spirv) {
            id = shader_name_to_resource_id_fp32_spirv(name);
            source = ShaderCache::Fp32Spirv;
        } else {
            id = shader_name_to_resource_id(name);
            source = ShaderCache::Dxbc;
        }
        if (id == 0) {
            LOGE("Unknown shader name '%s' from framegen", name.c_str());
            return {};
        }
        auto spirv = load_cached_spirv(cache, id, source);

        // Per-shader fallback chain: FP16 → FP32 SPIR-V → DXBC. A single
        // missing blob shouldn't kill the session if a lower-tier cache can
        // serve it. Skipping a missing FP32 SPIR-V → DXBC also means the
        // device must support VMM for that one shader to dispatch — that's
        // correct: if the FP32 cache was complete we wouldn't be here.
        if (spirv.empty() && source == ShaderCache::Fp16Spirv) {
            const uint32_t fp32Id = shader_name_to_resource_id_fp32_spirv(name);
            if (fp32Id != 0) {
                LOGW("FP16 shader '%s' (id %u) missing — falling back to FP32 SPIR-V (id %u)",
                     name.c_str(), id, fp32Id);
                spirv = load_cached_spirv(cache, fp32Id, ShaderCache::Fp32Spirv);
            }
        }
        if (spirv.empty() && (source == ShaderCache::Fp16Spirv || source == ShaderCache::Fp32Spirv)) {
            const uint32_t dxbcId = shader_name_to_resource_id(name);
            if (dxbcId != 0) {
                LOGW("SPIR-V shader '%s' (id %u) missing — falling back to DXBC (id %u)",
                     name.c_str(), id, dxbcId);
                spirv = load_cached_spirv(cache, dxbcId, ShaderCache::Dxbc);
            }
        }
        if (spirv.empty()) {
            LOGE("Shader '%s' (id %u) missing from cache (%s)",
                 name.c_str(), id, cache.c_str());
        }
        return spirv;
    };

    try {
        if (g.performanceMode) {
            LSFG_3_1P::initialize(g.vk.deviceUuid, g.hdr, g.flowScale,
                                  static_cast<uint64_t>(g.multiplier), loader);
        } else {
            LSFG_3_1::initialize(g.vk.deviceUuid, g.hdr, g.flowScale,
                                 static_cast<uint64_t>(g.multiplier), loader);
        }
        return true;
    } catch (const std::exception &e) {
        LOGE("LSFG_3_1::initialize threw: %s — likely missing extension or shader. Continuing in capture-only mode.", e.what());
        return false;
    } catch (...) {
        LOGE("LSFG_3_1::initialize threw unknown exception");
        return false;
    }
}

bool createFramegenContext() {
    // Pass AHardwareBuffer pointers to framegen's Android variant. Framegen
    // imports them in its own VkDevice and shares pixel storage with us via
    // the AHB itself — we keep ownership and refcount on the Android side.
    if (g.inSlot[0].ahb == nullptr || g.inSlot[1].ahb == nullptr) {
        LOGE("Input AhbImages have no AHB pointer");
        return false;
    }
    std::vector<AHardwareBuffer*> outAhbs;
    outAhbs.reserve(g.outputs.size());
    for (auto &o : g.outputs) {
        if (o.ahb == nullptr) {
            LOGE("Output AhbImage missing AHB pointer");
            return false;
        }
        outAhbs.push_back(o.ahb);
    }

    try {
        if (g.performanceMode) {
            g.framegenCtxId = LSFG_3_1P::createContextFromAHB(
                g.inSlot[0].ahb, g.inSlot[1].ahb, outAhbs,
                g.inSlot[0].extent, g.inSlot[0].format);
        } else {
            g.framegenCtxId = LSFG_3_1::createContextFromAHB(
                g.inSlot[0].ahb, g.inSlot[1].ahb, outAhbs,
                g.inSlot[0].extent, g.inSlot[0].format);
        }
    } catch (const std::exception &e) {
        LOGE("createContextFromAHB threw: %s", e.what());
        return false;
    }
    return true;
}

// Output blit. Has two paths:
//
//  1. GPU fast path (WSI): vkCmdBlitImage from the output AHB's VkImage
//     straight into the next swapchain image, then vkQueuePresentKHR. Zero
//     CPU touch of the pixel data. Used when the swapchain is live AND no
//     CPU post-process stage is active (NPU/CPU filters mutate pixels
//     on CPU and need the lock path). Saves ~3-5 ms/blit at 1080p.
//
//  2. CPU path (legacy): AHardwareBuffer_lock(CPU_READ) on the output,
//     ANativeWindow_lock on the window's next buffer, memcpy rows, post.
//     Still used when WSI is unavailable OR NPU/CPU post is on.
//
// GPU post-process (when enabled) runs into g.gpuPostImage via a compute
// shader first, then THAT AHB goes through either path above.
void blitOutputToWindow(const AhbImage &out, bool allowGpuPost = true) {
    if (out.ahb == nullptr) return;

    OutputWindowSnapshot outputWindow = acquireOutputWindowSnapshot();
    if (!outputWindow) return;

    if (allowGpuPost && gpuWantsPostLsfg()) {
        noteGpuShaderPassPending();
        const uint32_t scaledW = std::max<uint32_t>(
            1, static_cast<uint32_t>(std::lround(out.extent.width * g.gpuUpscaleFactor)));
        const uint32_t scaledH = std::max<uint32_t>(
            1, static_cast<uint32_t>(std::lround(out.extent.height * g.gpuUpscaleFactor)));
        const GpuPostProcessConfig gpuCfg{
            .method = g.gpuMethod,
            .sharpness = g.gpuSharpness,
            .strength = g.gpuStrength,
        };
        if (ensureGpuPostImage(scaledW, scaledH) &&
                g.gpuPost.process(g.vk, out, g.gpuPostImage, gpuCfg)) {
            blitOutputToWindow(g.gpuPostImage, false);
            return;
        }
        LOGW("GPU post-process failed; falling back to direct overlay blit");
    }

    // WSI fast path: skip the CPU lock/memcpy entirely. Only viable when no
    // CPU-side post-process is active (NPU or CPU filters need to read and
    // mutate pixels through ANativeWindow_lock, which can't coexist with a
    // Vulkan swapchain on the same surface).
    //
    // Build the swapchain lazily on first use — at initContext time the
    // overlay's Surface is still owned by the mirror VirtualDisplay, but by
    // the time blitOutputToWindow runs the VD has been retargeted to the
    // ImageReader by setLsfgMode and the Surface is free.
    const bool cpuPostActive = g.npuPostProcessing || g.cpuPostProcessing;
    if (kEnableWsiSwapchain && !cpuPostActive && g.vk.hasSwapchain
            && !g.swap.disabledForSession) {
        if (g.swap.swapchain == VK_NULL_HANDLE) {
            if (!createSwapchain()) {
                // Mark disabled so subsequent blits don't spin on the
                // failed creation path; use CPU blit for the rest of the
                // session.
                g.swap.disabledForSession = true;
                LOGI("WSI blit unavailable on this surface — using CPU blit for session");
            }
        }
        if (g.swap.swapchain != VK_NULL_HANDLE) {
            if (blitOutputToSwapchain(out)) return;
            // On OUT_OF_DATE we marked swap.outOfDate; next frame triggers
            // the recreate above. No need to fall through — the missed frame
            // costs 16 ms at worst, and forcing a CPU lock now would conflict
            // with the pending-destroy swapchain.
            return;
        }
    }

    const uint32_t npuScale = g.npuPostProcessing && g.npuUpscaleFactor == 2
        ? 2U
        : 1U;
    const uint32_t targetW = out.extent.width * npuScale;
    const uint32_t targetH = out.extent.height * npuScale;
    // Only call setBuffersGeometry when parameters actually change.  On some
    // drivers (MediaTek, certain Mali) calling it on every blit triggers a
    // SurfaceTexture buffer-queue reconfiguration even when nothing changed,
    // which discards already-queued frames and leaves the overlay frozen on
    // the first successfully displayed buffer.
    if (targetW != g.winGeomW || targetH != g.winGeomH || g.winGeomFmt != WINDOW_FORMAT_RGBA_8888) {
        ANativeWindow_setBuffersGeometry(outputWindow.window,
            static_cast<int32_t>(targetW),
            static_cast<int32_t>(targetH),
            WINDOW_FORMAT_RGBA_8888);
        g.winGeomW   = targetW;
        g.winGeomH   = targetH;
        g.winGeomFmt = WINDOW_FORMAT_RGBA_8888;
        LOGI("blitOutputToWindow: setBuffersGeometry %ux%u fmt=RGBA8888", targetW, targetH);
    }

    // Synchronization is handled by the producer side before calling into this
    // blit path:
    // - generated outputs: LSFG_3_1::waitIdle() / LSFG_3_1P::waitIdle()
    // - raw current frame: copyAhbImage() waits for the transfer queue submit
    // Doing an extra vkDeviceWaitIdle() here stalls the whole Android-side
    // Vulkan session on every posted frame and injects visible pacing jitter.

    AHardwareBuffer_Desc desc{};
    AHardwareBuffer_describe(out.ahb, &desc);

    void *srcPtr = nullptr;
    if (AHardwareBuffer_lock(out.ahb,
            AHARDWAREBUFFER_USAGE_CPU_READ_RARELY,
            -1, nullptr, &srcPtr) != 0 || srcPtr == nullptr) {
        LOGW("AHardwareBuffer_lock(read) failed on output");
        return;
    }
    const uint32_t srcStrideBytes = desc.stride * 4;  // RGBA8888

    const uint32_t blitIdx = g.blitLogCount.fetch_add(1, std::memory_order_relaxed);
    const bool needStats = !g.lumaGateOpen || blitIdx < 30;
    uint32_t avgLuma = 0;
    uint32_t avgAlpha = 255;
    if (needStats) {
        // Sample luma only while the dark-frame gate is still active or while
        // we're in the initial debug window. Once the gate has opened, doing
        // this on every frame just burns CPU in the hottest path.
        uint64_t lumaSum = 0;
        uint64_t alphaSum = 0;
        uint32_t samples = 0;
        const auto *srcBytes = static_cast<const uint8_t *>(srcPtr);
        const uint32_t sW = std::min<uint32_t>(desc.width, 32);
        const uint32_t sH = std::min<uint32_t>(desc.height, 18);
        for (uint32_t sy = 0; sy < sH; ++sy) {
            const uint32_t y = sH > 1 ? (sy * (desc.height - 1)) / (sH - 1) : 0;
            for (uint32_t sx = 0; sx < sW; ++sx) {
                const uint32_t x = sW > 1 ? (sx * (desc.width - 1)) / (sW - 1) : 0;
                const uint8_t *p = srcBytes + y * srcStrideBytes + x * 4;
                lumaSum  += (77u * p[0] + 150u * p[1] + 29u * p[2]) >> 8u;
                alphaSum += p[3];
                ++samples;
            }
        }
        if (samples > 0) {
            avgLuma = static_cast<uint32_t>(lumaSum / samples);
            avgAlpha = static_cast<uint32_t>(alphaSum / samples);
        }
    }

    if (blitIdx < 30) {
        LOGI("blit #%u src=%ux%u stride=%u avgLuma=%u avgAlpha=%u outWindow=%ux%u",
             blitIdx + 1, desc.width, desc.height, desc.stride,
             avgLuma, avgAlpha, outputWindow.width, outputWindow.height);
    }

    // Feedback-loop gate: if setSkipScreenshot failed, MediaProjection captures
    // our overlay (opaque dark) instead of the game, locking avgLuma near zero.
    // Keep the overlay transparent (skip the blit) until a bright frame proves
    // we are seeing real game content. Once luma>=18 arrives the gate latches
    // open for the session so dark in-game scenes (fade-to-black, cutscenes,
    // night-mode camera apps) still get LSFG.
    //
    // The threshold was originally 30 — that's too tight for camera/photography
    // apps and dark games (e.g. com.ktzevani.nativecameravulkan averages ~25-29
    // on real content), causing the user to see ~1s of black overlay before the
    // gate opens. A real feedback loop pins luma to 0-5; anything above ~10 is
    // already dim-but-real game content and safe to forward. 18 is a comfortable
    // safety margin that still rejects the dark feedback signal.
    //
    // Additionally: force-open after 120 consecutive dark frames (~2s) regardless
    // of luma. If the user's screenshot exclusion is broken AND the game is
    // genuinely dark, holding the overlay transparent forever is worse than a
    // brief feedback flash that lets them see the game and toggle the overlay
    // off. Without this escape hatch, very dark legitimate content (true
    // black-on-black scenes) would wedge the overlay forever.
    constexpr uint32_t kLumaGateOpenThreshold = 18;
    constexpr uint32_t kLumaGateForceOpenAfter = 120;
    if (!g.lumaGateOpen) {
        if (avgLuma >= kLumaGateOpenThreshold) {
            g.lumaGateOpen = true;
            LOGI("blitOutputToWindow: luma gate opened after %u dark frames (luma=%u)",
                 g.lumaGateDarkCount, avgLuma);
        } else if (g.lumaGateDarkCount >= kLumaGateForceOpenAfter) {
            g.lumaGateOpen = true;
            LOGW("blitOutputToWindow: luma gate force-opened after %u dark frames (luma=%u) — content may be very dim or feedback loop",
                 g.lumaGateDarkCount, avgLuma);
        } else {
            ++g.lumaGateDarkCount;
            if (g.lumaGateDarkCount <= 5u || g.lumaGateDarkCount % 300u == 0u) {
                LOGI("blitOutputToWindow: dark frame suppressed (luma=%u count=%u) — overlay transparent",
                     avgLuma, g.lumaGateDarkCount);
            }
            AHardwareBuffer_unlock(out.ahb, nullptr);
            return; // keep overlay transparent — suppress dark feedback frame
        }
    }

    ANativeWindow_Buffer dst{};
    if (ANativeWindow_lock(outputWindow.window, &dst, nullptr) != 0) {
        AHardwareBuffer_unlock(out.ahb, nullptr);
        LOGW("ANativeWindow_lock failed");
        return;
    }
    // The window is now (and stays) bound to a CPU producer for this session.
    // Pre-pin the taint so the next createSwapchain attempt bails fast.
    g.windowCpuProducerLocked = true;
    const uint32_t dstStrideBytes = static_cast<uint32_t>(dst.stride) * 4;

    auto *src = static_cast<const uint8_t *>(srcPtr);
    auto *dest = static_cast<uint8_t *>(dst.bits);
    if (gpuWantsPostLsfg()) {
        noteGpuShaderPassPending();
    }
    bool npuPosted = false;
    uint32_t producedW = desc.width;
    uint32_t producedH = desc.height;
    if (g.npuPostProcessing) {
        const NnapiPostProcessConfig postCfg{
            .preset = static_cast<NpuPreset>(g.npuPreset),
            .upscaleFactor = g.npuUpscaleFactor,
            .amount = g.npuAmount,
            .radius = g.npuRadius,
            .threshold = g.npuThreshold,
            .fp16 = g.npuFp16,
        };
        // configure() returns true only when a graph is compiled on a
        // dedicated NPU. If it returns false we treat this frame as no-op
        // for the NPU stage — but we don't disable the whole category
        // unless processRgba8888 actually fails.
        if (g.npuPost.configure(desc.width, desc.height, postCfg) &&
                g.npuPost.outputWidth() <= static_cast<uint32_t>(dst.width) &&
                g.npuPost.outputHeight() <= static_cast<uint32_t>(dst.height)) {
            npuPosted = g.npuPost.processRgba8888(src, srcStrideBytes, dest, dstStrideBytes);
            if (npuPosted) {
                producedW = g.npuPost.outputWidth();
                producedH = g.npuPost.outputHeight();
            }
        }
        if (!npuPosted && static_cast<NpuPreset>(g.npuPreset) != NpuPreset::OFF) {
            LOGW("NPU post-process failed; disabling NPU category for this session");
            g.npuPostProcessing = false;
            g.npuPost.reset();
        }
    }

    if (!npuPosted) {
        const uint32_t dstStridePixels = static_cast<uint32_t>(dst.stride);
        const uint32_t copyPixels = std::min(
            std::min<uint32_t>(desc.width, desc.stride),
            std::min<uint32_t>(static_cast<uint32_t>(dst.width), dstStridePixels));
        const uint32_t copyRows = std::min<uint32_t>(desc.height, static_cast<uint32_t>(dst.height));
        if (copyPixels == 0 || copyRows == 0) {
            LOGW("blitOutputToWindow: empty copy region src=%ux%u stride=%u dst=%dx%d stride=%d",
                 desc.width, desc.height, desc.stride,
                 dst.width, dst.height, dst.stride);
            ANativeWindow_unlockAndPost(outputWindow.window);
            AHardwareBuffer_unlock(out.ahb, nullptr);
            return;
        }
        const bool canMemcpyFast = avgAlpha >= 250u;
        const size_t copyBytesPerRow = static_cast<size_t>(copyPixels) * 4u;
        for (uint32_t y = 0; y < copyRows; ++y) {
            uint8_t *dstRowBytes = dest + static_cast<size_t>(y) * dstStrideBytes;
            const uint8_t *srcRowBytes = src + static_cast<size_t>(y) * srcStrideBytes;
            if (canMemcpyFast) {
                memcpy(dstRowBytes, srcRowBytes, copyBytesPerRow);
            } else {
                const uint32_t *sRow = reinterpret_cast<const uint32_t *>(srcRowBytes);
                uint32_t *dRow = reinterpret_cast<uint32_t *>(dstRowBytes);
                for (uint32_t x = 0; x < copyPixels; ++x) {
                    dRow[x] = sRow[x] | 0xFF000000u;
                }
            }
        }
        producedW = copyPixels;
        producedH = copyRows;
    }

    // CPU post-process runs on the destination in-place. Scoped to the
    // region we've actually written so we never read past the blit area.
    if (g.cpuPostProcessing) {
        const CpuPostProcessConfig cpuCfg{
            .preset = static_cast<CpuPreset>(g.cpuPreset),
            .strength = g.cpuStrength,
            .saturation = g.cpuSaturation,
            .vibrance = g.cpuVibrance,
            .vignette = g.cpuVignette,
        };
        const bool active = g.cpuPost.configure(producedW, producedH, cpuCfg);
        if (active) {
            g.cpuPost.process(dest, dstStrideBytes, dest, dstStrideBytes,
                              producedW, producedH);
        }
    }

    const int postResult = ANativeWindow_unlockAndPost(outputWindow.window);
    if (postResult != 0) {
        LOGW("ANativeWindow_unlockAndPost failed: %d (blit will not appear)", postResult);
    }
    AHardwareBuffer_unlock(out.ahb, nullptr);
    // Count this as an overlay post (ground truth for HUD total-fps metric
    // and for the pacing graph's frame-interval samples).
    recordOverlayPost();
}

void workerThread() {
    int64_t prevCaptureTimestampNs = 0;
    bool havePrevCaptureTimestamp = false;

    // EMA-smoothed capture interval. A single static clamp cannot serve both
    // slow sources (2 fps gif → want ~500 ms paced) and fast sources (60 fps
    // with noisy timestamps → must not let a spike turn into a 500 ms sleep).
    // So we track a moving average and derive a dynamic ceiling (2× EMA). A
    // ratio-based outlier detector skips EMA updates on spikes but still caps
    // them to the current dynamic max; if outliers persist (genuine source
    // regime change) we reset and re-converge.
    double emaNs = 0.0;
    bool emaInit = false;
    int consecutiveOutliers = 0;

    // ---- Frame-time profiling ------------------------------------------------
    //
    // Rolling accumulators over a 60-frame window. The 4 segments are:
    //   copy     — importAhbImage + processRealFrameIntoSlot (input prep)
    //   present  — LSFG_3_1::presentContext (framegen submit; usually <1 ms)
    //   waitIdle — LSFG_3_1::waitIdle (cross-device sync; biggest single cost)
    //   blit     — output blit loop (CPU memcpy + ANativeWindow_unlockAndPost,
    //              one per generated + real frame)
    //   total    — frameWorkStartedAt → end of blit loop
    // pacing sleep_until() time is intentionally NOT included — that's the
    // worker idling on purpose to honor the next vsync, not work.
    struct ProfileAccum {
        int64_t copyNs    = 0;
        int64_t presentNs = 0;
        int64_t waitIdleNs= 0;
        int64_t blitNs    = 0;
        int64_t totalNs   = 0;
        int64_t queueNs   = 0;
        int64_t captureToDisplayNs = 0;
        uint32_t blitCount = 0;
        uint32_t samples  = 0;
    } prof{};
    constexpr uint32_t kProfileWindow = 60;

    // The original LSFG capture app clears the overlay before MediaProjection
    // starts consuming it, to avoid a feedback loop from stale overlay pixels.
    // PeaSyo does not capture its own display; it feeds decoded stream frames
    // into LSFG directly. So the clear is unnecessary here, and on WSI sessions
    // it is actively harmful because the first ANativeWindow_lock permanently
    // binds the BufferQueue to a CPU producer, disabling the swapchain fast
    // path for the rest of the session.
    OutputWindowSnapshot startupOutputWindow = acquireOutputWindowSnapshot();
    const bool shouldCpuClearOutput =
        startupOutputWindow &&
        (!kEnableWsiSwapchain || g.npuPostProcessing || g.cpuPostProcessing || !g.vk.hasSwapchain);
    if (shouldCpuClearOutput) {
        ANativeWindow_setBuffersGeometry(startupOutputWindow.window,
            static_cast<int32_t>(startupOutputWindow.width),
            static_cast<int32_t>(startupOutputWindow.height),
            WINDOW_FORMAT_RGBA_8888);
        ANativeWindow_Buffer clearBuf{};
        if (ANativeWindow_lock(startupOutputWindow.window, &clearBuf, nullptr) == 0) {
            memset(clearBuf.bits, 0,
                   static_cast<size_t>(clearBuf.stride) *
                   static_cast<size_t>(clearBuf.height) * 4);
            ANativeWindow_unlockAndPost(startupOutputWindow.window);
            // The BufferQueue is now bound to a CPU producer for this window.
            // Any later createSwapchain attempt would fail with
            // VK_ERROR_NATIVE_WINDOW_IN_USE_KHR — pre-pin the taint so we
            // don't even try (see createSwapchain for rationale).
            g.windowCpuProducerLocked = true;
            LOGI("workerThread: cleared overlay to transparent");
        }
    } else if (startupOutputWindow) {
        LOGI("workerThread: skip startup CPU clear to preserve WSI output path");
    }

    // Drain any frames that were buffered during shader compilation.  Those
    // frames were captured while the overlay may have been dark (stale content
    // from a prior session), so feeding them into framegen would re-seed the
    // feedback loop.  Drop them now that we have posted a transparent clear.
    {
        std::unique_lock<std::mutex> lock(g.mu);
        if (!g.pending.empty()) {
            LOGI("workerThread: draining %zu stale init frames", g.pending.size());
            for (auto &pf : g.pending) {
                if (pf.ahb) AHardwareBuffer_release(pf.ahb);
            }
            g.pending.clear();
        }
    }

    while (true) {
        State::PendingFrame pendingFrame{};
        {
            std::unique_lock<std::mutex> lock(g.mu);
            g.pendingCv.wait(lock, []{ return g.stopRequested || !g.pending.empty(); });
            if (g.stopRequested && g.pending.empty()) return;
            pendingFrame = g.pending.front();
            g.pending.pop_front();
        }
        const auto frameWorkStartedAt = State::Clock::now();
        prof.queueNs += std::chrono::duration_cast<std::chrono::nanoseconds>(
            frameWorkStartedAt - pendingFrame.queuedAt).count();
        AHardwareBuffer *ahb = pendingFrame.ahb;
        if (ahb == nullptr) continue;

        // Wrap the imported AHB (read-only from our perspective) and copy
        // into the oldest input slot.
        AhbImage src{};
        const int rc = importAhbImage(g.vk, ahb, src);
        if (rc != kOk) {
            LOGW("importAhbImage failed rc=%d", rc);
            AHardwareBuffer_release(ahb);
            continue;
        }

        // Framegen tracks an internal frameIdx and treats inImg_0 as the
        // "current" frame when frameIdx % 2 == 0, inImg_1 when % 2 == 1
        // (see lsfg-vk-android/framegen/v3.1_include/v3_1/context.hpp:61).
        // We must write the new capture into the slot framegen will consider
        // "current" at the upcoming present — otherwise it computes the optical
        // flow backwards (treating yesterday's frame as "now"), which collapses
        // moving objects like a head or torso.
        const int newSlot = (g.presentsDone % 2 == 0) ? 0 : 1;
        const int prevSlot = 1 - newSlot;

        // Diagnostic helper: CPU-lock any AHB and sample a 4×4 luma grid.
        // Safe before copyAhbImage (no Vulkan queue ops yet on src) and after
        // (vkQueueWaitIdle ran inside copyAhbImage / processRealFrameIntoSlot).
        auto sampleAhb = [](AHardwareBuffer *a, const char *label) {
            AHardwareBuffer_Desc d{};
            AHardwareBuffer_describe(a, &d);
            void *ptr = nullptr;
            if (AHardwareBuffer_lock(a, AHARDWAREBUFFER_USAGE_CPU_READ_RARELY,
                    -1, nullptr, &ptr) != 0 || ptr == nullptr) {
                LOGI("%s: lock failed", label);
                return;
            }
            const auto *b = static_cast<const uint8_t*>(ptr);
            const uint32_t stride = d.stride * 4;
            uint64_t sum = 0;
            for (uint32_t row = 0; row < 4; row++) {
                for (uint32_t col = 0; col < 4; col++) {
                    const uint32_t y = row * d.height / 4;
                    const uint32_t x = col * d.width  / 4;
                    const uint8_t *p = b + y * stride + x * 4;
                    sum += (77u*p[0] + 150u*p[1] + 29u*p[2]) >> 8;
                }
            }
            LOGI("%s: %ux%u stride=%u luma=%llu",
                 label, d.width, d.height, d.stride,
                 (unsigned long long)(sum / 16u));
            AHardwareBuffer_unlock(a, nullptr);
        };

        // Pre-copy: sample the MediaProjection source AHB before any GPU work.
        // Extended to 30 frames to capture any delayed dark-onset pattern.
        if (g.framesCopied < 30) {
            char lbl[40];
            std::snprintf(lbl, sizeof(lbl), "pre_copy_src[%llu]",
                         (unsigned long long)g.framesCopied);
            sampleAhb(src.ahb, lbl);
        }

        // Bootstrap: the very first capture has no predecessor, so seed BOTH
        // slots with the same pixels. That makes the optical flow for the first
        // present a no-op (same image on both inputs) and the output equals the
        // input — clean instead of ghosted.
        if (g.framesCopied == 0) {
            if (!processRealFrameIntoSlot(src, g.inSlot[0]) ||
                    !processRealFrameIntoSlot(src, g.inSlot[1])) {
                LOGW("bootstrap frame input processing failed");
                destroyAhbImage(g.vk, src);
                AHardwareBuffer_release(ahb);
                continue;
            }
        } else {
            if (!processRealFrameIntoSlot(src, g.inSlot[newSlot])) {
                LOGW("frame input processing failed");
                destroyAhbImage(g.vk, src);
                AHardwareBuffer_release(ahb);
                continue;
            }
        }
        // Post-copy: verify the destination slot was written correctly.
        // Extended to 8 copies to capture the frame-4 failure.
        if (g.framesCopied < 8) {
            auto sampleSlot = [&sampleAhb](int slot) {
                char lbl[32];
                std::snprintf(lbl, sizeof(lbl), "post_copy slot%d", slot);
                sampleAhb(g.inSlot[slot].ahb, lbl);
            };
            if (g.framesCopied == 0) {
                sampleSlot(0);
                sampleSlot(1);
            } else {
                sampleSlot(newSlot);
            }
        }

        g.framesCopied++;
        bool suppressGeneratedFrames =
            g.antiArtifacts.load(std::memory_order_relaxed)
            && g.framesCopied > 1
            && shouldSuppressGeneratedFrames(g.inSlot[prevSlot], g.inSlot[newSlot]);

        destroyAhbImage(g.vk, src);
        AHardwareBuffer_release(ahb);

        // PROFILE: input copy phase done.
        const auto tCopyDone = State::Clock::now();

        const bool runFramegen = g.framegenCtxId >= 0
                                 && !g.bypass.load(std::memory_order_relaxed)
                                 && !g.framegenAutoDisabled.load(std::memory_order_relaxed);
        if (runFramegen) {
            // No semaphores in this minimal path — synchronous via queue idle.
            std::vector<int> outSems;  // empty
            try {
                if (g.performanceMode)
                    LSFG_3_1P::presentContext(g.framegenCtxId, /*inSem*/ -1, outSems);
                else
                    LSFG_3_1::presentContext(g.framegenCtxId, /*inSem*/ -1, outSems);
            } catch (const std::exception &e) {
                const char *what = e.what() != nullptr ? e.what() : "(null)";
                LOGE("presentContext threw: %s", what);
                // Detect VK_ERROR_DEVICE_LOST (-4): framegen's compute device
                // is gone (driver crash, OOM, surface-instance state mishap on
                // Mali-G57 etc.). Every subsequent submit on a lost device
                // returns -4 too — auto-disable framegen for this session and
                // fall through to passthrough so the overlay still shows the
                // captured stream instead of erroring on every frame. Cleared
                // on the next initRenderLoop, when the device is recreated.
                const bool isDeviceLost = std::strstr(what, "error -4") != nullptr ||
                                          std::strstr(what, "DEVICE_LOST")  != nullptr;
                if (isDeviceLost && !g.framegenAutoDisabled.load(std::memory_order_relaxed)) {
                    LOGE("presentContext: VK_ERROR_DEVICE_LOST — auto-disabling framegen for this session (passthrough until next context reinit)");
                    g.framegenAutoDisabled.store(true, std::memory_order_relaxed);
                }
                continue;
            }
            // PROFILE: presentContext returned (CPU-side; the GPU work is
            // still pending on framegen's queue).
            const auto tPresentDone = State::Clock::now();
            // Wait for framegen's GPU work to actually finish before we (a)
            // overwrite the input AHB on the next pushFrame and (b) read the
            // output AHB for the blit. Framegen and our session use different
            // VkDevices, so vkDeviceWaitIdle on either is necessary — without
            // an explicit shared semaphore this is the only correct sync.
            if (g.performanceMode) LSFG_3_1P::waitIdle();
            else                   LSFG_3_1::waitIdle();
            // PROFILE: cross-device sync complete; outputs ready to read.
            const auto tWaitIdleDone = State::Clock::now();

            // Note: a previous revision auto-disabled framegen here when the
            // GPU pipeline was slower than the source cadence. Removed by
            // design — if the user picks heavy settings (flowScale=1.0 +
            // high multiplier on a weak device) it's their call to live with
            // the resulting frame rate. Silently flipping to passthrough
            // looked like a bug ("framegen stopped after 5s"). The bottom-of-
            // pipeline DEVICE_LOST fallback in presentContext above still
            // protects against unrecoverable driver errors.
            // Accumulator for the actual time spent inside blitOutputToWindow
            // calls — excludes pacing sleep_until() time, which is idle, not
            // work. Reset each iteration; consumed by the profile logger below.
            int64_t blitWorkNsThisFrame = 0;
            auto timedBlit = [&blitWorkNsThisFrame, &pendingFrame, &prof](const AhbImage &out) {
                const auto t0 = State::Clock::now();
                blitOutputToWindow(out);
                const auto t1 = State::Clock::now();
                blitWorkNsThisFrame += std::chrono::duration_cast<
                    std::chrono::nanoseconds>(t1 - t0).count();
                const uint64_t postTimeNs = std::chrono::duration_cast<std::chrono::nanoseconds>(
                    t1.time_since_epoch()).count();
                if (postTimeNs > static_cast<uint64_t>(pendingFrame.captureTimestampNs)) {
                    prof.captureToDisplayNs += static_cast<int64_t>(
                        postTimeNs - static_cast<uint64_t>(pendingFrame.captureTimestampNs));
                }
                prof.blitCount++;
            };

            State::Clock::duration captureInterval = State::Clock::duration::zero();
            const ShizukuTimingSample shizuku = loadShizukuTimingSample();
            const bool haveShizukuCadence =
                shizuku.enabled &&
                shizuku.frameTimeNs > 0 &&
                shizuku.timestampNs >= pendingFrame.captureTimestampNs;
            const bool haveCaptureDelta =
                havePrevCaptureTimestamp &&
                pendingFrame.captureTimestampNs > prevCaptureTimestampNs;
            if (haveShizukuCadence || haveCaptureDelta) {
                // Hard floor (125 Hz) and absolute ceiling (1 Hz). The ceiling
                // prevents the worker from sleeping for many seconds if the
                // source genuinely runs slower than 1 fps — at that point pacing
                // stops being useful and reactivity matters more.
                constexpr double minNs = 8.0  * 1'000'000.0;  // 125 Hz
                constexpr double absMaxNs = 1000.0 * 1'000'000.0; // 1 Hz

                // Prefer the inter-capture timestamp delta when available: it
                // measures the actual game-render cadence. Shizuku/Root capture
                // services report a frameTimeNs that is the inter-arrival of
                // buffers from the capture transport (display refresh rate, on
                // some devices ~3 ms), not the underlying render rate — using
                // it would clamp captureInterval to the 8 ms minNs floor, and
                // remainingBudget = captureInterval - (copy+present+waitIdle)
                // would always go negative, leaving step=0 so the pacing loop
                // posts every generated frame immediately. SurfaceFlinger then
                // drops all of them and the user sees only the real frame.
                double rawNs;
                if (haveCaptureDelta) {
                    rawNs = static_cast<double>(
                        pendingFrame.captureTimestampNs - prevCaptureTimestampNs);
                } else {
                    rawNs = static_cast<double>(shizuku.frameTimeNs);
                }
                if (rawNs < minNs) rawNs = minNs;

                if (!emaInit) {
                    emaNs = rawNs;
                    emaInit = true;
                    consecutiveOutliers = 0;
                } else {
                    // Outlier detection via ratio: a frame > N× the running
                    // average (or < 1/N) is treated as a one-off glitch and
                    // does NOT update the EMA — otherwise a single spike of
                    // 500 ms on a 16 ms stream would poison the next dozen
                    // frames. Persistent outliers (≥3 in a row) mean the
                    // source regime has actually changed, so we reset and
                    // re-converge on the new rate. User-tunable (2.0..8.0).
                    const double kOutlier = static_cast<double>(
                        g.outlierRatioMicro.load(std::memory_order_relaxed)) / 1'000'000.0;
                    const bool outlier = rawNs > kOutlier * emaNs ||
                                         rawNs * kOutlier < emaNs;
                    if (outlier) {
                        consecutiveOutliers++;
                        if (consecutiveOutliers >= 3) {
                            emaNs = rawNs;           // reset: new regime
                            consecutiveOutliers = 0;
                        }
                    } else {
                        // TCP-RTT-style EMA. α=1/8 (default) reacts in ~8 frames
                        // and smooths ordinary jitter; user-tunable 0.05..0.5.
                        const double alpha = static_cast<double>(
                            g.emaAlphaMicro.load(std::memory_order_relaxed)) / 1'000'000.0;
                        emaNs = alpha * rawNs + (1.0 - alpha) * emaNs;
                        consecutiveOutliers = 0;
                    }
                }

                // Dynamic ceiling: 2× EMA gives enough headroom that a genuine
                // ±50% capture-rate variation is paced correctly, while a rare
                // outlier is clipped before it becomes a long sleep_until.
                double dynMaxNs = 2.0 * emaNs;
                if (dynMaxNs > absMaxNs) dynMaxNs = absMaxNs;
                if (rawNs > dynMaxNs) rawNs = dynMaxNs;

                // User-set output FPS cap. The cap applies to the *total* output
                // stream, and each capture produces (multiplier+1) frames, so
                // the floor on captureInterval is (multiplier+1) * 1e9 / cap.
                const int capHz = g.targetFpsCapHz.load(std::memory_order_relaxed);
                if (capHz > 0) {
                    const int framesPerPair = g.multiplier + 1;
                    const double capFloorNs =
                        static_cast<double>(framesPerPair) * 1'000'000'000.0
                        / static_cast<double>(capHz);
                    if (rawNs < capFloorNs) rawNs = capFloorNs;
                }

                // Anti-jitter gate disabled: on at least one device pairing
                // (Adreno 840 + Shizuku capture service on Snapdragon) the
                // reported pacingJitterNs is dominated by the sampling noise of
                // the metrics service rather than actual render-rate jitter,
                // so jitter routinely exceeds 35% of rawNs and this gate
                // suppressed every generated frame — the user saw only the
                // real capture rate even though the HUD claimed framegen was
                // active. The original purpose was to avoid optical-flow
                // artefacts on fast camera motion; that case is already handled
                // by the antiArtifacts content-similarity check earlier in this
                // function (shouldSuppressGeneratedFrames).
                (void)haveShizukuCadence;

                captureInterval = std::chrono::nanoseconds(
                    static_cast<int64_t>(rawNs));
            } else if (pendingFrame.captureTimestampNs <= 0) {
                // Fallback for sources that don't provide a valid presentation timestamp.
                captureInterval = std::chrono::milliseconds(16);
            }
            prevCaptureTimestampNs = pendingFrame.captureTimestampNs;
            havePrevCaptureTimestamp = pendingFrame.captureTimestampNs > 0;

            if (suppressGeneratedFrames && !g.outputs.empty()
                    && captureInterval != State::Clock::duration::zero()) {
                // For stream input, dropping the whole generated half of the pair
                // makes cadence visibly collapse (reads as flashing / stutter).
                // Instead, keep the exact same pacing slots but fill them with the
                // real current frame. That preserves 120 Hz presentation while
                // avoiding unreliable synthetic frames during violent scene changes.
                const auto now = State::Clock::now();
                auto remainingBudget = captureInterval - (now - frameWorkStartedAt);
                if (remainingBudget < State::Clock::duration::zero()) {
                    remainingBudget = State::Clock::duration::zero();
                }
                const auto slotCount = static_cast<int64_t>(g.outputs.size() + 1);
                const auto step = remainingBudget / slotCount;
                auto deadline = now;
                auto lastPostedAt = now;
                for (size_t i = 0; i < g.outputs.size(); ++i) {
                    timedBlit(g.inSlot[newSlot]);
                    lastPostedAt = State::Clock::now();
                    deadline += step;
                    if (step > State::Clock::duration::zero()) {
                        deadline = sleepUntilVsyncAligned(deadline, lastPostedAt, step);
                    }
                }
                if (step > State::Clock::duration::zero()) {
                    sleepUntilVsyncAligned(State::Clock::now(), lastPostedAt, step);
                }
                timedBlit(g.inSlot[newSlot]);
            } else if (suppressGeneratedFrames) {
                // No pacing budget available; still prefer the real frame over
                // unstable generated content.
                timedBlit(g.inSlot[newSlot]);
            } else if (!g.outputs.empty() && captureInterval != State::Clock::duration::zero()) {
                // Pacing strategy differs by regime:
                //
                // Fast sources (30+ fps): compute takes a large fraction of the
                // capture interval, so we need to return to the worker loop
                // promptly. Sleep only between generated frames using what's left
                // of the budget, then blit the real frame immediately. Trying to
                // hold the real frame for its "fair slot" here overflows the
                // pending queue (cap=4) and causes dropped frames / stutter.
                //
                // Slow sources (e.g. 2 fps gif): compute is negligible vs the
                // interval, so without a hold after the last generated frame, the
                // real frame would sit on screen for the whole remaining interval
                // (hundreds of ms) while the generated frames flash by in the
                // first ms. Here we DO want the hold.
                //
                // Heuristic: if another frame is already queued, we're in the
                // fast regime (backlog exists) — skip the hold. Otherwise we have
                // idle time and should pace the real frame too.
                const auto now = State::Clock::now();
                auto remainingBudget = captureInterval - (now - frameWorkStartedAt);
                if (remainingBudget < State::Clock::duration::zero()) {
                    remainingBudget = State::Clock::duration::zero();
                }
                const auto slotCount = static_cast<int64_t>(g.outputs.size() + 1);
                const auto step = remainingBudget / slotCount;
                auto deadline = now;
                // Track the time of the most recent unlockAndPost so the
                // vsync-aligned sleep knows whether a pending deadline would
                // collide with the SurfaceFlinger slot we just used.
                auto lastPostedAt = now;
                for (auto &o : g.outputs) {
                    // Blit first, then sleep: the generated output is ready the
                    // moment waitIdle() returns, so delaying the first blit by
                    // `step` adds deterministic latency to every frame and the
                    // overlay looks jittery at steady state. Sleep paces the
                    // gap BEFORE the next blit instead.
                    timedBlit(o);
                    lastPostedAt = State::Clock::now();
                    deadline += step;
                    if (step > State::Clock::duration::zero()) {
                        deadline = sleepUntilVsyncAligned(deadline, lastPostedAt, step);
                    }
                }
                // Match the Linux layer behaviour: after the generated intermediary
                // frames, present the actual current frame so fast camera motion gets
                // re-anchored to the real capture instead of showing only synthetic
                // frames back-to-back. Align this final post to vsync too so it
                // doesn't collide with the previous generated post.
                if (step > State::Clock::duration::zero()) {
                    sleepUntilVsyncAligned(State::Clock::now(), lastPostedAt, step);
                }
                timedBlit(g.inSlot[newSlot]);
            } else {
                for (auto &o : g.outputs) timedBlit(o);
                timedBlit(g.inSlot[newSlot]);
            }

            if (!suppressGeneratedFrames) {
                g.generatedFrames.fetch_add(g.outputs.size(), std::memory_order_relaxed);
            }
            g.presentsDone++;  // keep our slot indexing in sync with framegen's frameIdx

            // PROFILE: accumulate this frame's segments and emit a summary
            // every kProfileWindow frames. Numbers reported are AVERAGES over
            // the window. `blitWork` excludes pacing sleep_until() time so it
            // reflects only the actual blit cost; `wallEnd` is the full
            // worker iteration including any pacing sleep.
            const auto tFrameEnd = State::Clock::now();
            using ns = std::chrono::nanoseconds;
            prof.copyNs     += std::chrono::duration_cast<ns>(tCopyDone     - frameWorkStartedAt).count();
            prof.presentNs  += std::chrono::duration_cast<ns>(tPresentDone  - tCopyDone).count();
            prof.waitIdleNs += std::chrono::duration_cast<ns>(tWaitIdleDone - tPresentDone).count();
            prof.blitNs     += blitWorkNsThisFrame;
            prof.totalNs    += std::chrono::duration_cast<ns>(tFrameEnd - frameWorkStartedAt).count();
            prof.samples++;
            if (prof.samples >= kProfileWindow) {
                const double n = static_cast<double>(prof.samples);
                const double avgWaitIdleMs = (prof.waitIdleNs / n) / 1'000'000.0;
                const double avgWallEndMs  = (prof.totalNs    / n) / 1'000'000.0;
                const double avgQueueMs    = (prof.queueNs    / n) / 1'000'000.0;
                const double avgLatencyMs  = prof.blitCount > 0
                    ? (prof.captureToDisplayNs / static_cast<double>(prof.blitCount)) / 1'000'000.0
                    : 0.0;
                LOGI("frame profile (avg over %u): copy=%.2fms present=%.2fms waitIdle=%.2fms blitWork=%.2fms wallEnd=%.2fms queue=%.2fms latency=%.2fms (mult=%d outputs=%zu)",
                     prof.samples,
                     (prof.copyNs / n)     / 1'000'000.0,
                     (prof.presentNs / n)  / 1'000'000.0,
                     avgWaitIdleMs,
                     (prof.blitNs / n)     / 1'000'000.0,
                     avgWallEndMs,
                     avgQueueMs,
                     avgLatencyMs,
                     g.multiplier, g.outputs.size());
                // Publish the closed window so the benchmark JNI getter can
                // surface segment averages without scraping logcat.
                g.profileSnapshotCopyNs.store(prof.copyNs, std::memory_order_relaxed);
                g.profileSnapshotPresentNs.store(prof.presentNs, std::memory_order_relaxed);
                g.profileSnapshotWaitIdleNs.store(prof.waitIdleNs, std::memory_order_relaxed);
                g.profileSnapshotBlitNs.store(prof.blitNs, std::memory_order_relaxed);
                g.profileSnapshotTotalNs.store(prof.totalNs, std::memory_order_relaxed);
                g.profileSnapshotQueueNs.store(prof.queueNs, std::memory_order_relaxed);
                g.profileSnapshotLatencyNs.store(prof.captureToDisplayNs, std::memory_order_relaxed);
                g.profileSnapshotBlitCount.store(prof.blitCount, std::memory_order_relaxed);
                g.profileSnapshotSamples.store(prof.samples, std::memory_order_relaxed);
                prof = ProfileAccum{};
            }
        } else {
            // Bypass mode (user toggled the switch) OR framegen unavailable
            // (createContext failed): blit the raw capture straight through so
            // the overlay still shows live frames at capture rate. The total-FPS
            // counter stays equal to the real-FPS counter because we don't
            // increment generatedFrames here.
            blitOutputToWindow(g.inSlot[newSlot]);
        }
    }
}

} // namespace

int initRenderLoop(const char *cacheDir, const RenderLoopConfig &cfg) {
    std::lock_guard<std::mutex> lock(g.mu);
    if (g.initialized) return kRenderLoopAlreadyInit;

    // multiplier in the prefs is the *total* output rate factor (2x = 60fps from 30fps);
    // framegen's generationCount is how many *extra* frames to interpolate per input
    // pair. So generationCount = multiplier - 1, and we allocate that many output AHBs.
    // (Mirrors lsfg-vk-android/src/context.cpp:80-81,101.)
    const int totalMult = cfg.multiplier > 1 ? cfg.multiplier : 2;
    g.multiplier = totalMult - 1;  // generationCount = N extra frames per pair
    g.performanceMode = cfg.performance;
    g.framegenFp16 = cfg.framegenFp16;
    g.hdr = cfg.hdr;
    g.antiArtifacts.store(cfg.antiArtifacts, std::memory_order_relaxed);
    const bool requestedNpu = cfg.npuPostProcessing;
    g.npuPreset = cfg.npuPreset < 0 ? 0 : (cfg.npuPreset > 4 ? 0 : cfg.npuPreset);
    g.npuUpscaleFactor = cfg.npuUpscaleFactor == 2 ? 2 : 1;
    g.npuAmount = clamp01(cfg.npuAmount);
    g.npuRadius = cfg.npuRadius < 0.5f ? 0.5f : (cfg.npuRadius > 2.0f ? 2.0f : cfg.npuRadius);
    g.npuThreshold = clamp01(cfg.npuThreshold);
    g.npuFp16 = cfg.npuFp16;
    // Default: if the user toggled the NPU category on but left the preset at
    // "Off", fall back to SHARPEN so something visible happens. Without this
    // the UI silently had no effect until the user scrolled down and picked a
    // preset, which read as "toggle does nothing".
    if (requestedNpu && g.npuPreset == 0 && g.npuUpscaleFactor != 2) {
        g.npuPreset = 1; // SHARPEN
    }
    const bool npuWantsWork = g.npuPreset != 0 || g.npuUpscaleFactor == 2;
    const bool npuAvailable = requestedNpu && npuWantsWork &&
        !nnapi_npu_accelerator_devices().empty();
    g.npuPostProcessing = npuAvailable;
    g.cpuPostProcessing = cfg.cpuPostProcessing;
    g.cpuPreset = cfg.cpuPreset < 0 ? 0 : (cfg.cpuPreset > 6 ? 0 : cfg.cpuPreset);
    g.cpuStrength = clamp01(cfg.cpuStrength);
    g.cpuSaturation = clamp01(cfg.cpuSaturation);
    g.cpuVibrance = clamp01(cfg.cpuVibrance);
    g.cpuVignette = clamp01(cfg.cpuVignette);
    g.gpuPostProcessing = cfg.gpuPostProcessing;
    g.gpuStage = cfg.gpuStage == 0 ? 0 : 1;
    g.gpuMethod = cfg.gpuMethod < 0 ? 0 : (cfg.gpuMethod > 15 ? 0 : cfg.gpuMethod);
    g.gpuUpscaleFactor = clampScale(cfg.gpuUpscaleFactor);
    g.gpuSharpness = clamp01(cfg.gpuSharpness);
    g.gpuStrength = clamp01(cfg.gpuStrength);
    g.gpuNoopLogged = false;
    if (g.gpuPostProcessing) {
        LOGI("GPU post-processing configured: method=%s stage=%s scale=%.2f sharp=%.2f strength=%.2f",
             gpuMethodName(g.gpuMethod), gpuStageName(g.gpuStage),
             g.gpuUpscaleFactor, g.gpuSharpness, g.gpuStrength);
    }
    if (requestedNpu && !npuAvailable) {
        LOGW("NPU post-processing requested but no dedicated NNAPI accelerator is available. NPU category disabled.");
    } else if (npuAvailable) {
        LOGI("NPU post-processing enabled: preset=%d upscale=%dx amount=%.2f radius=%.2f fp16=%d devices=%s",
             g.npuPreset, g.npuUpscaleFactor, g.npuAmount, g.npuRadius, (int)g.npuFp16,
             nnapi_npu_summary().c_str());
    }
    if (g.cpuPostProcessing) {
        LOGI("CPU post-processing enabled: preset=%d strength=%.2f sat=%.2f vibrance=%.2f vignette=%.2f",
             g.cpuPreset, g.cpuStrength, g.cpuSaturation, g.cpuVibrance, g.cpuVignette);
    }
    // flowScale on the prefs slider is "0.25..1.0" in user-friendly form, but
    // framegen wants the reciprocal (Linux passes 1.0f / conf.flowScale at
    // src/context.cpp:101). Larger user value = finer flow grid = better quality.
    const float userFlow = (cfg.flowScale >= 0.25f && cfg.flowScale <= 1.0f) ? cfg.flowScale : 1.0f;
    g.flowScale = 1.0f / userFlow;
    applyPacingParamsImpl(cfg.targetFpsCap, cfg.emaAlpha, cfg.outlierRatio,
                          cfg.vsyncSlackMs, cfg.queueDepth);
    LOGI("Pacing: cap=%dHz alpha=%.3f outlier=%.2f slack=%.1fms queue=%d",
         g.targetFpsCapHz.load(std::memory_order_relaxed),
         static_cast<double>(g.emaAlphaMicro.load(std::memory_order_relaxed)) / 1'000'000.0,
         static_cast<double>(g.outlierRatioMicro.load(std::memory_order_relaxed)) / 1'000'000.0,
         static_cast<double>(g.vsyncSlackNs.load(std::memory_order_relaxed)) / 1'000'000.0,
         g.queueDepth.load(std::memory_order_relaxed));
    g.generatedFrames.store(0, std::memory_order_relaxed);
    g.postedFrames.store(0, std::memory_order_relaxed);
    g.uniqueCaptures.store(0, std::memory_order_relaxed);
    g.postRingHead.store(0, std::memory_order_relaxed);
    for (auto &slot : g.postRingTimestamps) {
        slot.store(0, std::memory_order_relaxed);
    }
    g.pushLogCount.store(0, std::memory_order_relaxed);
    g.blitLogCount.store(0, std::memory_order_relaxed);
    g.lumaGateOpen      = false;
    g.lumaGateDarkCount = 0;
    g.lumaGateStartNs   = 0;
    g.shizukuSampleTimestampNs.store(0, std::memory_order_relaxed);
    g.shizukuFrameTimeNs.store(0, std::memory_order_relaxed);
    g.shizukuPacingJitterNs.store(0, std::memory_order_relaxed);
    g.framesCopied = 0;
    g.presentsDone = 0;
    // Don't reset g.bypass — the user toggle should persist across re-inits
    // (e.g. when they change multiplier while bypass is on, the new context
    // should also start in bypass).
    // DO reset the framegen auto-disable latch — that flag tracks a driver
    // error tied to the previous device handle, which is being recreated here.
    // Carrying it forward would silently keep framegen off forever after one
    // bad submit, even on a healthy new device.
    g.framegenAutoDisabled.store(false, std::memory_order_relaxed);

    int rc = create_session(g.vk);
    if (rc != kOk) {
        LOGE("create_session failed rc=%d", rc);
        destroy_session(g.vk);
        return kRenderLoopSessionFailed;
    }

    const uint32_t renderW = gpuWantsPreLsfg()
        ? std::max<uint32_t>(1, static_cast<uint32_t>(std::lround(cfg.width * g.gpuUpscaleFactor)))
        : cfg.width;
    const uint32_t renderH = gpuWantsPreLsfg()
        ? std::max<uint32_t>(1, static_cast<uint32_t>(std::lround(cfg.height * g.gpuUpscaleFactor)))
        : cfg.height;
    if (gpuWantsPreLsfg()) {
        LOGI("GPU pre-LSFG active: capture=%ux%u render=%ux%u method=%s",
             cfg.width, cfg.height, renderW, renderH, gpuMethodName(g.gpuMethod));
    }

    const VkFormat fmt = VK_FORMAT_R8G8B8A8_UNORM;
    for (int i = 0; i < 2; ++i) {
        rc = createAhbImage(g.vk, renderW, renderH, fmt, g.inSlot[i]);
        if (rc != kOk) {
            LOGE("createAhbImage(input %d) failed rc=%d", i, rc);
            shutdownRenderLoop();
            return kRenderLoopBufferAlloc;
        }
        initInSlotImageLayout(g.inSlot[i].image);
    }
    // Number of outputs = generationCount, matching framegen "level".
    g.outputs.resize(g.multiplier);
    for (int i = 0; i < g.multiplier; ++i) {
        rc = createAhbImage(g.vk, renderW, renderH, fmt, g.outputs[i]);
        if (rc != kOk) {
            LOGE("createAhbImage(output %d) failed rc=%d", i, rc);
            shutdownRenderLoop();
            return kRenderLoopBufferAlloc;
        }
    }

    g.framegenInitOk = initFramegen(cacheDir);
    if (g.framegenInitOk) {
        if (!createFramegenContext()) {
            LOGE("createFramegenContext failed — running in capture-only mode (counter will stay at 0)");
            g.framegenCtxId = -1;
        }
    } else {
        g.framegenCtxId = -1;
    }

    g.initialized = true;
    g.stopRequested = false;
    g.worker = std::thread(workerThread);
    // Do NOT build the swapchain here. At initContext time the overlay's
    // Surface is still owned by the mirror VirtualDisplay producer — it's
    // only detached when setLsfgMode() runs (which retargets the VD to the
    // ImageReader). Creating the swapchain before that point races against
    // ANativeWindow's single-producer rule. The first blitOutputToWindow
    // call after LSFG mode is live builds it lazily.
    LOGI("Render loop initialised: capture=%ux%u render=%ux%u totalMult=%dx (gen=%d extra) flowScale=%.2f(internal=%.2f) hdr=%d perf=%d npu=%d cpu=%d gpu=%d ctxId=%d",
         cfg.width, cfg.height, renderW, renderH, totalMult, g.multiplier,
         userFlow, g.flowScale,
         (int)g.hdr, (int)g.performanceMode, (int)g.npuPostProcessing,
         (int)g.cpuPostProcessing, (int)g.gpuPostProcessing, g.framegenCtxId);
    // Tell the caller whether framegen is actually running. If not, Kotlin
    // will keep the overlay up in mirror mode instead of routing the capture
    // through a dead LSFG context.
    return (g.framegenCtxId >= 0) ? kOk : kRenderLoopFramegenDisabled;
}

void setOutputSurface(ANativeWindow *win, uint32_t w, uint32_t h) {
    std::lock_guard<std::mutex> lock(g.mu);
    // Always tear down any prior swapchain first — it holds a VkSurfaceKHR
    // which holds an ANativeWindow reference, and the spec requires the
    // surface outlive the swapchain but be destroyed before the window.
    destroySwapchain();
    if (g.outWindow != nullptr) {
        ANativeWindow_release(g.outWindow);
        g.outWindow = nullptr;
    }
    if (win != nullptr) {
        ANativeWindow_acquire(win);
        g.outWindow = win;
        g.outWidth = w;
        g.outHeight = h;
        g.winGeomW = 0;
        g.winGeomH = 0;
        g.winGeomFmt = 0;
        g.swapWinW = w;
        g.swapWinH = h;
        // Fresh ANativeWindow — its BufferQueue producer slot is empty until
        // the first ANativeWindow_lock or vkCreateAndroidSurfaceKHR succeeds.
        // Reset the taint so a new window can take the WSI fast path even if
        // a previous one was poisoned for CPU.
        g.windowCpuProducerLocked = false;
        // WSI swapchain is only useful when no CPU-side post-process is
        // running. If NPU or CPU filters are on, they need to read/write the
        // pixels on CPU and the CPU blit path handles that; switching to the
        // swapchain would break them because ANativeWindow_lock can't be
        // mixed with Vulkan-side presents on the same surface.
        //
        // Important for the in-app PeaSyo SurfaceView path: creating the
        // swapchain synchronously here is too early on some OEM stacks. Right
        // after surfaceCreated/surfaceChanged the BLAST-backed native window
        // exists, but a direct vkCreateAndroidSurfaceKHR can still SIGSEGV in
        // the vendor driver before the stream session has even started. The
        // render path already has a lazy WSI build in blitOutputToWindow();
        // keep setOutputSurface limited to attaching the window and let the
        // worker build the swapchain on first actual output frame instead.
        const bool cpuPostActive = g.npuPostProcessing || g.cpuPostProcessing;
        if (kEnableWsiSwapchain && !cpuPostActive && g.initialized) {
            LOGI("Output surface attached %ux%u native=%p path=WSI (lazy create on first blit)",
                 w, h, static_cast<void *>(win));
        } else {
            const char *why = !kEnableWsiSwapchain ? "WSI disabled"
                            : cpuPostActive         ? "post-process=on"
                            : !g.initialized        ? "pre-init"
                                                    : "unknown";
            LOGI("Output surface attached %ux%u native=%p path=CPU (%s)",
                 w, h, static_cast<void *>(win), why);
        }
    } else {
        g.outWidth = 0;
        g.outHeight = 0;
        g.winGeomW = 0;
        g.winGeomH = 0;
        g.winGeomFmt = 0;
        g.swapWinW = 0;
        g.swapWinH = 0;
        LOGI("Output surface detached");
    }
}

void pushFrame(AHardwareBuffer *ahb, int64_t timestampNs) {
    if (ahb == nullptr) return;
    const uint32_t pushLogIndex = g.pushLogCount.load(std::memory_order_relaxed);
    if (pushLogIndex < 30) {
        AHardwareBuffer_Desc desc{};
        AHardwareBuffer_describe(ahb, &desc);
        if (g.pushLogCount.fetch_add(1, std::memory_order_relaxed) < 30) {
            LOGI("pushFrame #%u ahb=%ux%u stride=%u fmt=%u usage=0x%llx ts=%lld",
                 pushLogIndex + 1, desc.width, desc.height, desc.stride, desc.format,
                 static_cast<unsigned long long>(desc.usage),
                 static_cast<long long>(timestampNs));
        }
    }

    g.uniqueCaptures.fetch_add(1, std::memory_order_relaxed);

    AHardwareBuffer_acquire(ahb);
    {
        std::lock_guard<std::mutex> lock(g.mu);
        if (!g.initialized) {
            AHardwareBuffer_release(ahb);
            return;
        }
        // In framegen mode temporal continuity matters: throwing away older
        // captures widens the pair LSFG sees and causes optical-flow artifacts
        // on fast camera movement. So we keep a short FIFO.
        //
        // However, once the queue is saturated the worker is already too far
        // behind for continuity to hold — at that point dropping the NEW frame
        // pins the user on stale content (hundreds of ms old) and the overlay
        // feels stutter-y. Drop the OLDEST instead to prioritise freshness;
        // the continuity we lose is between two already-doomed frames.
        const size_t maxPending = static_cast<size_t>(
            g.queueDepth.load(std::memory_order_relaxed));
        if (g.pending.size() >= maxPending) {
            AHardwareBuffer_release(g.pending.front().ahb);
            g.pending.pop_front();
        }
        g.pending.push_back(State::PendingFrame{
            .ahb = ahb,
            .queuedAt = State::Clock::now(),
            .captureTimestampNs = timestampNs,
        });
    }
    g.pendingCv.notify_one();
}

void shutdownRenderLoop() {
    {
        std::lock_guard<std::mutex> lock(g.mu);
        g.stopRequested = true;
    }
    g.pendingCv.notify_all();
    if (g.worker.joinable()) g.worker.join();

    {
        std::lock_guard<std::mutex> lock(g.mu);
        for (const auto &pendingFrame : g.pending) AHardwareBuffer_release(pendingFrame.ahb);
        g.pending.clear();

        if (g.framegenCtxId >= 0) {
            try {
                if (g.performanceMode) LSFG_3_1P::deleteContext(g.framegenCtxId);
                else                   LSFG_3_1::deleteContext(g.framegenCtxId);
            } catch (...) {}
            g.framegenCtxId = -1;
        }
        if (g.framegenInitOk) {
            try {
                if (g.performanceMode) LSFG_3_1P::finalize();
                else                   LSFG_3_1::finalize();
            } catch (...) {}
            g.framegenInitOk = false;
        }

        for (auto &o : g.outputs) destroyAhbImage(g.vk, o);
        g.outputs.clear();
        g.gpuPost.reset(g.vk);
        destroyAhbImage(g.vk, g.gpuPostImage);
        for (int i = 0; i < 2; ++i) destroyAhbImage(g.vk, g.inSlot[i]);
        g.npuPost.reset();
        g.cpuPost.reset();

        // Destroy swapchain (and its surface) before the underlying ANativeWindow
        // is touched — surface destruction drops its internal window ref.
        // g.outWindow is intentionally kept live so the worker thread can still
        // blit during the next session's shader-compilation window (before
        // setOutputSurface is called).  setOutputSurface always releases the
        // old reference before acquiring the new one, so there is no leak.
        destroySwapchain();
        g.swapWinW = 0;
        g.swapWinH = 0;

        destroy_session(g.vk);
        g.initialized = false;
        g.generatedFrames.store(0, std::memory_order_relaxed);
        g.postedFrames.store(0, std::memory_order_relaxed);
        g.uniqueCaptures.store(0, std::memory_order_relaxed);
        g.postRingHead.store(0, std::memory_order_relaxed);
        for (auto &slot : g.postRingTimestamps) {
            slot.store(0, std::memory_order_relaxed);
        }
        g.shizukuSampleTimestampNs.store(0, std::memory_order_relaxed);
        g.shizukuFrameTimeNs.store(0, std::memory_order_relaxed);
        g.shizukuPacingJitterNs.store(0, std::memory_order_relaxed);
    }
    LOGI("Render loop shut down");
}

uint64_t getGeneratedFrameCount() {
    return g.generatedFrames.load(std::memory_order_relaxed);
}

uint64_t getPostedFrameCount() {
    return g.postedFrames.load(std::memory_order_relaxed);
}

uint64_t getUniqueCaptureCount() {
    return g.uniqueCaptures.load(std::memory_order_relaxed);
}

double getAverageQueueMs() {
    const int64_t samples = g.profileSnapshotSamples.load(std::memory_order_relaxed);
    if (samples <= 0) return 0.0;
    const int64_t queueNs = g.profileSnapshotQueueNs.load(std::memory_order_relaxed);
    return (static_cast<double>(queueNs) / samples) / 1'000'000.0;
}

double getAverageLatencyMs() {
    const int64_t blitCount = g.profileSnapshotBlitCount.load(std::memory_order_relaxed);
    if (blitCount <= 0) return 0.0;
    const int64_t latencyNs = g.profileSnapshotLatencyNs.load(std::memory_order_relaxed);
    return (static_cast<double>(latencyNs) / blitCount) / 1'000'000.0;
}

uint32_t getProfileWindowNs(int64_t *out, uint32_t cap) {
    // out layout: [copyNs, presentNs, waitIdleNs, blitNs, totalNs, samples].
    // Each value is the SUM over the last completed kProfileWindow window;
    // divide by samples for per-frame averages. Returns 6 when populated, 0
    // when no window has closed yet (samples==0) or when out is too small.
    if (out == nullptr || cap < 6) return 0;
    const int64_t samples = g.profileSnapshotSamples.load(std::memory_order_relaxed);
    if (samples <= 0) return 0;
    out[0] = g.profileSnapshotCopyNs.load(std::memory_order_relaxed);
    out[1] = g.profileSnapshotPresentNs.load(std::memory_order_relaxed);
    out[2] = g.profileSnapshotWaitIdleNs.load(std::memory_order_relaxed);
    out[3] = g.profileSnapshotBlitNs.load(std::memory_order_relaxed);
    out[4] = g.profileSnapshotTotalNs.load(std::memory_order_relaxed);
    out[5] = samples;
    return 6;
}

uint32_t getRecentPostIntervalsNs(int64_t *outIntervalsNs, uint32_t cap) {
    if (outIntervalsNs == nullptr || cap == 0) return 0;
    // Snapshot the ring head. Entries from (head - kPostRingSize) to (head-1)
    // are populated (older ones are overwritten by wrap-around). For intervals
    // we need consecutive pairs, so we can produce at most min(cap, N-1)
    // where N is how many valid entries are present.
    const uint64_t head = g.postRingHead.load(std::memory_order_acquire);
    if (head < 2) return 0;  // need at least 2 timestamps for one interval
    const uint64_t validEntries = std::min<uint64_t>(head, State::kPostRingSize);
    const uint64_t available = validEntries - 1;
    const uint32_t want = static_cast<uint32_t>(std::min<uint64_t>(cap, available));
    // Walk the ring newest-first: slot (head-1), (head-2), ... subtracting
    // successive pairs to produce intervals. Skip the pair if either half
    // is zero (race with concurrent write during startup).
    uint32_t written = 0;
    uint64_t prevTs = g.postRingTimestamps[(head - 1) % State::kPostRingSize]
                          .load(std::memory_order_relaxed);
    for (uint32_t i = 1; i <= want && written < cap; ++i) {
        const uint64_t slot = (head - 1 - i) % State::kPostRingSize;
        const uint64_t ts = g.postRingTimestamps[slot].load(std::memory_order_relaxed);
        if (ts == 0 || prevTs == 0 || prevTs < ts) {
            // Either a torn read (zero) or non-monotonic (wraparound race):
            // stop and return what we have.
            break;
        }
        outIntervalsNs[written++] = static_cast<int64_t>(prevTs - ts);
        prevTs = ts;
    }
    return written;
}

void setBypass(bool bypass) {
    g.bypass.store(bypass, std::memory_order_relaxed);
}

void setAntiArtifacts(bool enabled) {
    g.antiArtifacts.store(enabled, std::memory_order_relaxed);
}

void setVsyncPeriodNs(int64_t periodNs) {
    if (periodNs < 0) periodNs = 0;
    g.vsyncPeriodNs.store(periodNs, std::memory_order_relaxed);
}

void setPacingParams(int targetFpsCap, float emaAlpha, float outlierRatio,
                     float vsyncSlackMs, int queueDepth) {
    applyPacingParamsImpl(targetFpsCap, emaAlpha, outlierRatio,
                          vsyncSlackMs, queueDepth);
}

void setShizukuTimingEnabled(bool enabled) {
    g.shizukuTimingEnabled.store(enabled, std::memory_order_relaxed);
    if (!enabled) {
        g.shizukuSampleTimestampNs.store(0, std::memory_order_relaxed);
        g.shizukuFrameTimeNs.store(0, std::memory_order_relaxed);
        g.shizukuPacingJitterNs.store(0, std::memory_order_relaxed);
    }
    LOGI("Shizuku timing %s", enabled ? "enabled" : "disabled");
}

void reportShizukuTiming(int64_t timestampNs,
                         int64_t frameTimeNs,
                         int64_t pacingJitterNs) {
    if (!g.shizukuTimingEnabled.load(std::memory_order_relaxed)) return;
    g.shizukuSampleTimestampNs.store(timestampNs, std::memory_order_relaxed);
    g.shizukuFrameTimeNs.store(frameTimeNs, std::memory_order_relaxed);
    g.shizukuPacingJitterNs.store(
        pacingJitterNs >= 0 ? pacingJitterNs : 0,
        std::memory_order_relaxed);
}

} // namespace lsfg_android
