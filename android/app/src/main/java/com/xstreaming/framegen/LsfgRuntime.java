package com.xstreaming.framegen;

import android.content.Context;
import android.os.Build;

import com.lsfg.android.session.NativeBridge;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;

public final class LsfgRuntime {
    private static final String TAG = "LsfgRuntime";
    private static final String DLL_FILENAME = "Lossless.dll";

    private static final float STREAM_FLOW_SCALE = 0.70f;
    private static final boolean STREAM_USE_PERFORMANCE_MODE = true;
    private static final boolean STREAM_USE_ANTI_ARTIFACTS = true;
    private static final int STREAM_TARGET_FPS_CAP = 0;
    private static final float STREAM_EMA_ALPHA = 0.2f;
    private static final float STREAM_OUTLIER_RATIO = 3.0f;
    private static final float STREAM_VSYNC_SLACK_MS = 1.5f;
    private static final int STREAM_QUEUE_DEPTH = 2;

    private LsfgRuntime() {
    }

    public static final class PrepareResult {
        public final boolean ready;
        public final String message;

        PrepareResult(boolean ready, String message) {
            this.ready = ready;
            this.message = message;
        }
    }

    public static synchronized PrepareResult ensureReady(Context context) {
        if (context == null) {
            return new PrepareResult(false, "Context unavailable");
        }

        Context appContext = context.getApplicationContext();
        FrameGenLog.init(appContext);
        try {
            FrameGenLog.i(TAG, "native=" + NativeBridge.nativeVersion());
        } catch (Throwable t) {
            FrameGenLog.w(TAG, "nativeVersion failed", t);
        }
        FrameGenLog.i(
                TAG,
                "ensureReady sdk=" + Build.VERSION.SDK_INT
                        + " device=" + Build.MANUFACTURER + "/" + Build.MODEL
        );

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return new PrepareResult(false, "Android 10+ required");
        }

        File dllFile = new File(
                new File(appContext.getFilesDir(), "framegen"),
                DLL_FILENAME
        );
        if (!dllFile.isFile() || dllFile.length() == 0) {
            return new PrepareResult(false, "Lossless.dll has not been imported");
        }

        File cacheDir = new File(appContext.getFilesDir(), "spirv");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        String cachePath = cacheDir.getAbsolutePath();

        try {
            if (NativeBridge.probeShaders(cachePath) == 0) {
                FrameGenLog.i(TAG, "probeShaders cache hit: " + cachePath);
                return new PrepareResult(true, "");
            }
        } catch (Throwable t) {
            FrameGenLog.w(TAG, "probeShaders before extract failed", t);
        }

        int extractCode;
        try {
            extractCode = NativeBridge.extractShaders(
                    dllFile.getAbsolutePath(),
                    sha256(dllFile),
                    cachePath
            );
        } catch (Throwable t) {
            FrameGenLog.e(TAG, "extractShaders failed", t);
            return new PrepareResult(false, "extractShaders crashed: " + t.getMessage());
        }

        if (extractCode != 0) {
            return new PrepareResult(false, "extractShaders rc=" + extractCode);
        }

        int probeCode;
        try {
            probeCode = NativeBridge.probeShaders(cachePath);
        } catch (Throwable t) {
            FrameGenLog.e(TAG, "probeShaders after extract failed", t);
            return new PrepareResult(false, "probeShaders crashed: " + t.getMessage());
        }

        if (probeCode == 0) {
            FrameGenLog.i(TAG, "shader cache ready: " + cachePath);
            return new PrepareResult(true, "");
        }
        return new PrepareResult(false, "probeShaders rc=" + probeCode);
    }

    public static int initContext(
            Context context,
            int width,
            int height,
            boolean hdr,
            boolean framegenFp16
    ) {
        Context appContext = context.getApplicationContext();
        FrameGenLog.init(appContext);
        File cacheDir = new File(appContext.getFilesDir(), "spirv");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }

        boolean useGpuPostProcess = false;
        int rc = NativeBridge.initContext(
                cacheDir.getAbsolutePath(),
                width,
                height,
                2,
                STREAM_FLOW_SCALE,
                STREAM_USE_PERFORMANCE_MODE,
                hdr,
                STREAM_USE_ANTI_ARTIFACTS,
                framegenFp16,
                false,
                0,
                1,
                0.5f,
                1.0f,
                0.0f,
                false,
                false,
                0,
                0.5f,
                0.5f,
                0.0f,
                0.0f,
                useGpuPostProcess,
                1,
                0,
                1.0f,
                0.5f,
                0.5f,
                STREAM_TARGET_FPS_CAP,
                STREAM_EMA_ALPHA,
                STREAM_OUTLIER_RATIO,
                STREAM_VSYNC_SLACK_MS,
                STREAM_QUEUE_DEPTH
        );
        FrameGenLog.i(
                TAG,
                "initContext rc=" + rc
                        + " video=" + width + "x" + height
                        + " hdr=" + hdr
                        + " fp16=" + framegenFp16
                        + " perf=" + STREAM_USE_PERFORMANCE_MODE
                        + " antiArtifacts=" + STREAM_USE_ANTI_ARTIFACTS
                        + " flowScale=" + STREAM_FLOW_SCALE
                        + " queue=" + STREAM_QUEUE_DEPTH
                        + " gpuPost=" + useGpuPostProcess
        );
        return rc;
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder builder = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            builder.append(String.format("%02x", b));
        }
        return builder.toString();
    }
}
