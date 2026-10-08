package com.lsfg.android.session;

import android.hardware.HardwareBuffer;
import android.view.Surface;

public final class NativeBridge {
    static {
        System.loadLibrary("lsfg-android");
    }

    private NativeBridge() {
    }

    public static native String nativeVersion();

    public static native void initCrashReporter(String crashPath, String logPath);

    public static native void setVerboseLogging(boolean enabled);

    public static native int extractShaders(String dllPath, String dllSha256, String cacheDir);

    public static native int probeShaders(String cacheDir);

    public static native boolean isFramegenFp16Supported(String cacheDir);

    public static native int initContext(
            String cacheDir,
            int width,
            int height,
            int multiplier,
            float flowScale,
            boolean performance,
            boolean hdr,
            boolean antiArtifacts,
            boolean framegenFp16,
            boolean npuPostProcessing,
            int npuPreset,
            int npuUpscaleFactor,
            float npuAmount,
            float npuRadius,
            float npuThreshold,
            boolean npuFp16,
            boolean cpuPostProcessing,
            int cpuPreset,
            float cpuStrength,
            float cpuSaturation,
            float cpuVibrance,
            float cpuVignette,
            boolean gpuPostProcessing,
            int gpuStage,
            int gpuMethod,
            float gpuUpscaleFactor,
            float gpuSharpness,
            float gpuStrength,
            int targetFpsCap,
            float emaAlpha,
            float outlierRatio,
            float vsyncSlackMs,
            int queueDepth
    );

    public static native void setOutputSurface(Surface surface, int w, int h);

    public static native void pushFrame(HardwareBuffer hardwareBuffer, long timestampNs);

    public static native void setVsyncPeriodNs(long periodNs);

    public static native long getGeneratedFrameCount();

    public static native long getPostedFrameCount();

    public static native long getUniqueCaptureCount();

    public static native double getAverageQueueMs();

    public static native double getAverageLatencyMs();

    public static native void destroyContext();
}
