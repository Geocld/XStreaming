#pragma once

// Glue between MediaProjection (AHardwareBuffer frames pushed from Kotlin),
// the framegen LSFG_3_1 pipeline (consumes opaque FDs), and the overlay
// SurfaceView (an ANativeWindow we blit final frames to).
//
// Lifecycle:
//   init()        — create VulkanSession, allocate input/output AhbImages,
//                   call LSFG_3_1::initialize and createContext
//   setOutputSurface(window, w, h) — attach the overlay surface for blit
//   pushFrame(ahb)— enqueue a fresh capture frame; render thread will copy
//                   into the next ping-pong slot, present, and blit outputs
//   shutdown()    — flush, deleteContext, finalize, destroy session
//
// Counter:
//   getGeneratedFrameCount() — atomic counter incremented per generated
//   frame (multiplier-many per pushFrame). Drives the overlay's "total fps".

#include <cstdint>

struct ANativeWindow;
struct AHardwareBuffer;

namespace lsfg_android {

constexpr int kRenderLoopAlreadyInit = -40;
constexpr int kRenderLoopSessionFailed = -41;
constexpr int kRenderLoopFramegenFailed = -42;
constexpr int kRenderLoopBufferAlloc = -43;

// Positive "soft" status: init succeeded but framegen is disabled (missing
// extensions, shader load failure, FD export refused, …). The caller should
// fall back to mirror mode — keep the overlay up, feed it the raw capture,
// and surface a notice to the user. The render loop itself stays initialised
// and must be torn down normally via shutdownRenderLoop() when the session ends.
constexpr int kRenderLoopFramegenDisabled = 1;

struct RenderLoopConfig {
    uint32_t width;
    uint32_t height;
    int multiplier;       // generationCount passed to LSFG: total = capture * multiplier
    float flowScale;      // 0.25 .. 1.0
    bool performance;     // selects LSFG_3_1P vs LSFG_3_1
    bool hdr;
    bool antiArtifacts;
    // Use the precompiled SPIR-V FP16 shader variants (Lossless.dll resource
    // IDs 304..351) instead of the DXBC-translated FP32 set (255..302). The
    // FP16 variants enable OpCapability Float16 and use mixed FP16/FP32 ops.
    // Requires the GPU to support VK_KHR_shader_float16_int8 + shaderFloat16,
    // and requires the FP16 SPIR-V cache to have been populated by the DLL
    // extraction step. The render loop transparently falls back to the FP32
    // path when either prerequisite is missing.
    bool framegenFp16;
    bool npuPostProcessing;
    int npuPreset;        // see NpuPreset: 0 off, 1 sharpen, 2 detail boost, 3 chroma clean, 4 game crisp
    int npuUpscaleFactor; // 1 or 2
    float npuAmount;      // 0.0 .. 1.0 enhance strength
    float npuRadius;      // 0.5 .. 2.0 blur radius for unsharp-mask paths
    float npuThreshold;   // 0.0 .. 1.0 (reserved)
    bool npuFp16;
    // CPU post-process: pure CPU pixel pass, applied after NPU (or in place
    // of it when the user only toggled the CPU category). See CpuPreset.
    bool cpuPostProcessing;
    int cpuPreset;         // 0 off .. 6 cinematic
    float cpuStrength;     // 0.0 .. 1.0
    float cpuSaturation;   // 0.0 .. 1.0 (0.5 is neutral)
    float cpuVibrance;     // 0.0 .. 1.0
    float cpuVignette;     // 0.0 .. 1.0
    bool gpuPostProcessing;
    int gpuStage;          // 0 before LSFG on real frames, 1 after LSFG on final frames
    int gpuMethod;         // see GpuPostProcessingMethod.nativeValue
    float gpuUpscaleFactor;// 1.0 .. 2.0
    float gpuSharpness;    // 0.0 .. 1.0
    float gpuStrength;     // 0.0 .. 1.0
    // Pacing tunables (0/negative values fall back to defaults inside the loop).
    int targetFpsCap;      // 0 = unlimited
    float emaAlpha;        // 0.05 .. 0.5 (default 0.125)
    float outlierRatio;    // 2.0 .. 8.0 (default 4.0)
    float vsyncSlackMs;    // 1.0 .. 5.0 (default 2.0)
    int queueDepth;        // 2 .. 6 (default 4)
};

// Initialise render loop: create Vulkan session, allocate ping-pong inputs +
// (multiplier-1) outputs, initialize framegen, create context. Returns kOk
// or one of kRenderLoop* on failure.
//
// `cacheDir` is forwarded to the framegen shader-loader callback.
int initRenderLoop(const char *cacheDir, const RenderLoopConfig &cfg);

// Attach (or replace) the output ANativeWindow. Caller transfers ownership;
// the render loop will release the previous one (if any) and acquire `win`.
// Pass nullptr to detach.
void setOutputSurface(ANativeWindow *win, uint32_t w, uint32_t h);

// Push a capture frame. The render loop acquires a reference to `ahb`
// (so it stays valid past the caller's Image.close()) and processes it
// asynchronously. `timestampNs` should come from Image.getTimestamp() when
// available so output pacing can follow the real capture cadence.
// Safe to call from any thread.
void pushFrame(AHardwareBuffer *ahb, int64_t timestampNs);

// Shut down everything. Idempotent.
void shutdownRenderLoop();

// Counter for the FPS overlay. Returns 0 before init / after shutdown.
uint64_t getGeneratedFrameCount();

// Total frames actually posted to the overlay surface (CPU blit or WSI
// present path). Unlike getGeneratedFrameCount this includes the real
// capture post on each cycle, giving the HUD a ground-truth "total fps".
uint64_t getPostedFrameCount();

// Number of input frames accepted by the render loop. In PeaSyo's decoded
// stream path this is the cadence LSFG actually receives, which is what the
// HUD should pair with generated-frame throughput.
uint64_t getUniqueCaptureCount();

// Average time a capture spends queued in the native FIFO before the worker
// starts processing it, in milliseconds, over the last completed profiling
// window.
double getAverageQueueMs();

// Average end-to-end latency from capture enqueue timestamp to overlay post,
// in milliseconds, over the last completed profiling window.
double getAverageLatencyMs();

// Copies up to `cap` nanosecond-intervals between consecutive overlay posts
// into `outIntervalsNs`. Returns the number of intervals actually written.
// Newest-first order. Used by the HUD frame-pacing graph to show real
// jitter instead of rolling counts.
uint32_t getRecentPostIntervalsNs(int64_t *outIntervalsNs, uint32_t cap);

// Snapshot of the most recently completed profiling window. `out` must be
// at least 6 longs; on success populates [copyNs, presentNs, waitIdleNs,
// blitNs, totalNs, samples] (each segment is the SUM over the window —
// divide by samples for per-frame averages) and returns 6. Returns 0 when
// no window has completed yet or `cap` < 6. The benchmark mode polls this
// periodically to surface the same numbers shown in the per-window logcat
// summary, without scraping logs.
uint32_t getProfileWindowNs(int64_t *out, uint32_t cap);

// Toggle frame-gen bypass. When true, the worker skips framegen entirely and
// blits the latest captured frame straight to the output surface — useful for
// A/B comparisons against the generated output. Safe to call from any thread.
void setBypass(bool bypass);

// Toggle suppression of generated frames for high-delta frame pairs.
void setAntiArtifacts(bool enabled);

// Report the display's vsync period in nanoseconds (e.g. 16_666_666 for a
// 60 Hz display, 8_333_333 for 120 Hz). When set to a positive value the
// pacing loop aligns its sleep targets to vsync boundaries so consecutive
// ANativeWindow_unlockAndPost calls land on distinct vsync slots, avoiding
// the double-post → SurfaceFlinger-stall pattern that shows as periodic
// stutter. Passing 0 falls back to raw sleep_until.
void setVsyncPeriodNs(int64_t periodNs);

// Hot-apply pacing tunables without tearing down the render loop. `targetFpsCap`
// of 0 (or negative) disables the cap; the other parameters fall back to their
// defaults when outside a sane range. Safe to call from any thread.
void setPacingParams(int targetFpsCap,
                     float emaAlpha,
                     float outlierRatio,
                     float vsyncSlackMs,
                     int queueDepth);

// Enable/disable the Shizuku timing side channel. When enabled, the pacing
// loop may prefer the externally reported frame time over the raw capture
// timestamps, and may suppress generated frames when the external pacing
// jitter indicates the target stream is unstable.
void setShizukuTimingEnabled(bool enabled);

// Report one external timing sample from the Shizuku metrics side channel.
// `frameTimeNs` is the delta between two target frames; `pacingJitterNs` is
// the absolute deviation from the target cadence. Safe to call from any thread.
void reportShizukuTiming(int64_t timestampNs,
                         int64_t frameTimeNs,
                         int64_t pacingJitterNs);

} // namespace lsfg_android
