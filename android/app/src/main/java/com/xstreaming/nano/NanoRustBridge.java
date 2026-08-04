package com.xstreaming.nano;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Process;
import android.util.Log;
import android.view.Surface;

import androidx.annotation.Nullable;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Locale;

public final class NanoRustBridge {
    private static final String TAG = "NanoRustBridge";
    private static final boolean NATIVE_AVAILABLE;
    private static final long VIDEO_INPUT_BUFFER_TIMEOUT_US = 0L;
    private static final long VIDEO_OUTPUT_BUFFER_TIMEOUT_US = 100_000L;
    private static final long VIDEO_OUTPUT_THREAD_JOIN_TIMEOUT_MS = 5_000L;
    private static final long VIDEO_RENDER_START_DELAY_NS = 8_000_000L;
    private static final long VIDEO_RENDER_MAX_FUTURE_NS = 35_000_000L;
    private static final long VIDEO_RENDER_LATE_THRESHOLD_NS = 12_000_000L;
    public interface RumbleListener {
        void onRumble(
                double startDelay,
                int duration,
                int delayMs,
                int repeat,
                double weakMagnitude,
                double strongMagnitude,
                double leftTrigger,
                double rightTrigger);
    }

    static {
        boolean loaded;
        try {
            System.loadLibrary("nano_rs");
            loaded = true;
            Log.i(TAG, "nano_rs native library loaded");
        } catch (UnsatisfiedLinkError error) {
            loaded = false;
            Log.w(TAG, "nano_rs native library is not available yet", error);
        }
        NATIVE_AVAILABLE = loaded;
    }

    private long nativeHandle;
    private volatile boolean released = false;
    private volatile boolean sessionActive = false;
    private volatile boolean videoSurfaceActive = false;
    private final Object videoDecoderLock = new Object();
    @Nullable
    private Surface outputSurface;
    @Nullable
    private MediaCodec videoDecoder;
    @Nullable
    private String videoDecoderName;
    private int videoWidth = 1920;
    private int videoHeight = 1080;
    private long queuedVideoFrameCount = 0L;
    private long renderedVideoFrameCount = 0L;
    private long queuedVideoByteCount = 0L;
    private long firstVideoPresentationTimeUs = Long.MIN_VALUE;
    private long lastVideoPresentationTimeUs = Long.MIN_VALUE;
    private long firstVideoRenderPresentationTimeUs = Long.MIN_VALUE;
    private long firstVideoRenderTimeNs = Long.MIN_VALUE;
    @Nullable
    private Thread videoOutputThread;
    private volatile boolean videoOutputDrainRunning = false;
    private final Object audioDecoderLock = new Object();
    @Nullable
    private MediaCodec audioDecoder;
    @Nullable
    private AudioTrack audioTrack;
    private int audioSampleRate = 48000;
    private int audioChannelCount = 2;
    private long queuedAudioFrameCount = 0L;
    private long decodedAudioBufferCount = 0L;
    private volatile String sessionStage = "";
    private volatile String sessionStatusText = "";
    private volatile boolean terminalSessionError = false;
    private volatile double webRtcRttMs = -1.0;
    private volatile double webRtcJitterMs = -1.0;
    private volatile double webRtcFps = -1.0;
    private volatile double webRtcFramesDropped = -1.0;
    private volatile double webRtcFramesReceived = -1.0;
    private volatile double webRtcPacketsReceived = -1.0;
    private volatile double webRtcPacketsLost = -1.0;
    private volatile double webRtcPacketLossPercent = -1.0;
    private volatile double webRtcBitrateMbps = -1.0;
    private volatile double webRtcDecodeMs = -1.0;
    @Nullable
    private RumbleListener rumbleListener;

    public NanoRustBridge() {
        nativeHandle = NATIVE_AVAILABLE ? nativeCreateBridge() : 0L;
        Log.i(TAG, "bridge constructed nativeAvailable=" + NATIVE_AVAILABLE + " handle=" + nativeHandle);
    }

    public void setRumbleListener(@Nullable RumbleListener listener) {
        rumbleListener = listener;
    }

    public boolean isNativeAvailable() {
        return NATIVE_AVAILABLE && nativeHandle != 0L && !released;
    }

    public void updateStreamInfo(
            @Nullable String sessionId,
            @Nullable String streamType,
            @Nullable String renderEngine,
            @Nullable String baseUri,
            @Nullable String gsToken,
            @Nullable String webToken,
            int resolution,
            @Nullable String preferredLanguage,
            @Nullable String iceServerUrl,
            @Nullable String iceServerUsername,
            @Nullable String iceServerCredential,
            boolean stereoAudioEnabled,
            boolean coop,
            boolean hasWebToken,
            boolean hasStreamingTokens,
            boolean authReady) {
        if (!isNativeAvailable()) {
            Log.w(TAG, "updateStreamInfo skipped native unavailable");
            return;
        }
        Log.i(TAG, "updateStreamInfo session=" + safeLog(sessionId)
                + " type=" + safeLog(streamType)
                + " engine=" + safeLog(renderEngine)
                + " authReady=" + authReady
                + " hasStreamingTokens=" + hasStreamingTokens
                + " hasWebToken=" + hasWebToken);
        nativeSetStreamInfo(
                nativeHandle,
                sessionId == null ? "" : sessionId,
                streamType == null ? "" : streamType,
                renderEngine == null ? "" : renderEngine,
                baseUri == null ? "" : baseUri,
                gsToken == null ? "" : gsToken,
                webToken == null ? "" : webToken,
                resolution,
                preferredLanguage == null ? "" : preferredLanguage,
                iceServerUrl == null ? "" : iceServerUrl,
                iceServerUsername == null ? "" : iceServerUsername,
                iceServerCredential == null ? "" : iceServerCredential,
                stereoAudioEnabled,
                coop,
                hasWebToken,
                hasStreamingTokens,
                authReady);
        updateSessionStatus("stream-info", "Connecting...", false);
        synchronized (videoDecoderLock) {
            updateVideoSizeLocked(resolution);
            if (videoSurfaceActive) {
                ensureVideoDecoderLocked();
            }
        }
    }

    public void bindSurface(@Nullable Surface surface, int width, int height) {
        if (!isNativeAvailable()) {
            Log.w(TAG, "bindSurface skipped native unavailable");
            return;
        }
        Log.i(TAG, "bindSurface surface=" + (surface != null) + " size=" + width + "x" + height);
        synchronized (videoDecoderLock) {
            outputSurface = surface;
            videoSurfaceActive = surface != null && sessionActive;
            if (videoSurfaceActive) {
                ensureVideoDecoderLocked();
            } else {
                releaseVideoDecoderLocked();
            }
        }
        nativeSetSurface(nativeHandle, surface, width, height);
    }

    public void start() {
        if (!isNativeAvailable()) {
            Log.w(TAG, "start skipped native unavailable");
            return;
        }
        Log.i(TAG, "start requested handle=" + nativeHandle);
        sessionActive = true;
        synchronized (videoDecoderLock) {
            videoSurfaceActive = outputSurface != null;
            if (videoSurfaceActive) {
                ensureVideoDecoderLocked();
            }
        }
        nativeStart(nativeHandle);
    }

    public void stop() {
        if (!isNativeAvailable()) {
            Log.w(TAG, "stop skipped native unavailable");
            return;
        }
        Log.i(TAG, "stop requested handle=" + nativeHandle);
        sessionActive = false;
        videoSurfaceActive = false;
        synchronized (videoDecoderLock) {
            releaseVideoDecoderLocked();
        }
        synchronized (audioDecoderLock) {
            releaseAudioDecoderLocked();
        }
        nativeStop(nativeHandle);
    }

    public void releaseSurface() {
        if (!isNativeAvailable()) {
            Log.w(TAG, "releaseSurface skipped native unavailable");
            return;
        }
        Log.i(TAG, "releaseSurface requested handle=" + nativeHandle);
        synchronized (videoDecoderLock) {
            videoSurfaceActive = false;
            outputSurface = null;
            releaseVideoDecoderLocked();
        }
        nativeReleaseSurface(nativeHandle);
    }

    public void sendGamepadState(
            int gamepadIndex,
            int nexus,
            int menu,
            int view,
            int a,
            int b,
            int x,
            int y,
            int dpadUp,
            int dpadDown,
            int dpadLeft,
            int dpadRight,
            int leftShoulder,
            int rightShoulder,
            int leftThumb,
            int rightThumb,
            float leftThumbXAxis,
            float leftThumbYAxis,
            float rightThumbXAxis,
            float rightThumbYAxis,
            float leftTrigger,
            float rightTrigger) {
        if (!isNativeAvailable()) {
            Log.w(TAG, "sendGamepadState skipped native unavailable");
            return;
        }
        nativeSendGamepadState(
                nativeHandle,
                gamepadIndex,
                nexus,
                menu,
                view,
                a,
                b,
                x,
                y,
                dpadUp,
                dpadDown,
                dpadLeft,
                dpadRight,
                leftShoulder,
                rightShoulder,
                leftThumb,
                rightThumb,
                leftThumbXAxis,
                leftThumbYAxis,
                rightThumbXAxis,
                rightThumbYAxis,
                leftTrigger,
                rightTrigger);
    }

    public void queueVideoFrame(ByteBuffer data, long ptsUs, boolean keyframe) {
        if (!isNativeAvailable() || !sessionActive || !videoSurfaceActive) {
            return;
        }
        synchronized (videoDecoderLock) {
            if (!sessionActive || !videoSurfaceActive || outputSurface == null) {
                return;
            }
            if (videoDecoder == null && !ensureVideoDecoderLocked()) {
                return;
            }
            if (videoDecoder == null) {
                return;
            }

            try {
                int inputIndex = videoDecoder.dequeueInputBuffer(VIDEO_INPUT_BUFFER_TIMEOUT_US);
                if (inputIndex < 0) {
                    if (queuedVideoFrameCount == 0 || queuedVideoFrameCount % 120 == 0) {
                        Log.w(TAG, "Video decoder input unavailable count=" + queuedVideoFrameCount);
                    }
                    return;
                }

                ByteBuffer inputBuffer = videoDecoder.getInputBuffer(inputIndex);
                if (inputBuffer == null) {
                    Log.w(TAG, "Video decoder input buffer is null index=" + inputIndex);
                    releaseVideoDecoderLocked();
                    return;
                }

                ByteBuffer sourceBuffer = data.duplicate();
                sourceBuffer.position(0);
                sourceBuffer.limit(sourceBuffer.capacity());
                inputBuffer.clear();
                if (sourceBuffer.remaining() > inputBuffer.remaining()) {
                    Log.w(TAG, "Video frame too large data=" + sourceBuffer.remaining() + " remaining=" + inputBuffer.remaining());
                    releaseVideoDecoderLocked();
                    return;
                }
                inputBuffer.put(sourceBuffer);
                int flags = keyframe ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                long codecPtsUs = normalizeVideoPresentationTimeUs(ptsUs);
                videoDecoder.queueInputBuffer(inputIndex, 0, sourceBuffer.position(), codecPtsUs, flags);
                queuedVideoFrameCount += 1;
                queuedVideoByteCount += sourceBuffer.position();
                if (queuedVideoFrameCount == 1 || keyframe || queuedVideoFrameCount % 120 == 0) {
                    Log.i(TAG, "queueVideoFrame count=" + queuedVideoFrameCount
                            + " bytes=" + sourceBuffer.position()
                            + " sourcePtsUs=" + ptsUs
                            + " codecPtsUs=" + codecPtsUs
                            + " keyframe=" + keyframe);
                }
                if (queuedVideoFrameCount % 120 == 0
                        && queuedVideoFrameCount > renderedVideoFrameCount + 240) {
                    Log.w(TAG, "Video decoder release lag queued=" + queuedVideoFrameCount
                            + " released=" + renderedVideoFrameCount);
                }
            } catch (Throwable error) {
                Log.w(TAG, "Video frame queue failed", error);
                releaseVideoDecoderLocked();
            }
        }
    }

    public boolean shouldDropVideoFrame(boolean keyframe) {
        return false;
    }

    public void dropPendingVideoOutput(@Nullable String reason) {
        Log.w(TAG, "dropPendingVideoOutput reason=" + (reason == null ? "" : reason));
        if (!isNativeAvailable() || !sessionActive || !videoSurfaceActive) {
            return;
        }
        synchronized (videoDecoderLock) {
            dropPendingVideoOutputLocked();
        }
    }

    public void queueAudioFrame(ByteBuffer data, long ptsUs, int sampleRate, int channelCount) {
        if (!isNativeAvailable() || !sessionActive) {
            return;
        }
        synchronized (audioDecoderLock) {
            if (sampleRate > 0 && channelCount > 0
                    && (sampleRate != audioSampleRate || channelCount != audioChannelCount)) {
                audioSampleRate = sampleRate;
                audioChannelCount = Math.max(1, Math.min(2, channelCount));
                releaseAudioDecoderLocked();
            }
            if (audioDecoder == null && !ensureAudioDecoderLocked()) {
                return;
            }
            if (audioDecoder == null) {
                return;
            }

            try {
                int inputIndex = audioDecoder.dequeueInputBuffer(0);
                if (inputIndex < 0) {
                    drainAudioDecoderLocked();
                    inputIndex = audioDecoder.dequeueInputBuffer(0);
                }
                if (inputIndex < 0) {
                    return;
                }

                ByteBuffer inputBuffer = audioDecoder.getInputBuffer(inputIndex);
                if (inputBuffer == null) {
                    return;
                }

                ByteBuffer sourceBuffer = data.duplicate();
                sourceBuffer.position(0);
                sourceBuffer.limit(sourceBuffer.capacity());
                inputBuffer.clear();
                if (sourceBuffer.remaining() > inputBuffer.remaining()) {
                    Log.w(TAG, "Audio frame too large data=" + sourceBuffer.remaining() + " remaining=" + inputBuffer.remaining());
                    return;
                }
                inputBuffer.put(sourceBuffer);
                audioDecoder.queueInputBuffer(inputIndex, 0, sourceBuffer.position(), Math.max(0L, ptsUs), 0);
                queuedAudioFrameCount += 1;
                if (queuedAudioFrameCount == 1 || queuedAudioFrameCount % 300 == 0) {
                    Log.i(TAG, "queueAudioFrame count=" + queuedAudioFrameCount
                            + " bytes=" + sourceBuffer.position()
                            + " ptsUs=" + ptsUs
                            + " sampleRate=" + audioSampleRate
                            + " channels=" + audioChannelCount);
                }
                drainAudioDecoderLocked();
            } catch (Throwable error) {
                Log.w(TAG, "Audio frame queue failed", error);
                releaseAudioDecoderLocked();
            }
        }
    }

    public void updateSessionStatus(String stage, String message, boolean terminal) {
        sessionStage = stage == null ? "" : stage;
        sessionStatusText = message == null ? "" : message;
        terminalSessionError = terminal;
        if (terminal) {
            Log.w(TAG, "session status stage=" + sessionStage + " message=" + sessionStatusText);
        } else {
            Log.i(TAG, "session status stage=" + sessionStage + " message=" + sessionStatusText);
        }
    }

    public void updateWebRtcStats(
            double rttMs,
            double jitterMs,
            double fps,
            double framesDropped,
            double framesReceived,
            double packetsReceived,
            double packetsLost,
            double packetLossPercent,
            double bitrateMbps,
            double decodeMs) {
        webRtcRttMs = rttMs;
        webRtcJitterMs = jitterMs;
        webRtcFps = fps;
        webRtcFramesDropped = framesDropped;
        webRtcFramesReceived = framesReceived;
        webRtcPacketsReceived = packetsReceived;
        webRtcPacketsLost = packetsLost;
        webRtcPacketLossPercent = packetLossPercent;
        webRtcBitrateMbps = bitrateMbps;
        webRtcDecodeMs = decodeMs;
        Log.i(TAG, "webrtc stats rttMs=" + rttMs
                + " jitterMs=" + jitterMs
                + " fps=" + fps
                + " framesDropped=" + framesDropped
                + " framesReceived=" + framesReceived
                + " packetsReceived=" + packetsReceived
                + " packetsLost=" + packetsLost
                + " packetLossPercent=" + packetLossPercent
                + " bitrateMbps=" + bitrateMbps
                + " decodeMs=" + decodeMs);
    }

    public void onRumble(
            double startDelay,
            int duration,
            int delayMs,
            int repeat,
            double weakMagnitude,
            double strongMagnitude,
            double leftTrigger,
            double rightTrigger) {
        Log.i(TAG, "rumble duration=" + duration
                + " weak=" + weakMagnitude
                + " strong=" + strongMagnitude
                + " lt=" + leftTrigger
                + " rt=" + rightTrigger
                + " delayMs=" + delayMs
                + " repeat=" + repeat);
        RumbleListener listener = rumbleListener;
        if (listener != null) {
            listener.onRumble(
                    startDelay,
                    duration,
                    delayMs,
                    repeat,
                    weakMagnitude,
                    strongMagnitude,
                    leftTrigger,
                    rightTrigger);
        }
    }

    public void release() {
        if (nativeHandle == 0L) {
            return;
        }
        long handle = nativeHandle;
        nativeHandle = 0L;
        released = true;
        sessionActive = false;
        videoSurfaceActive = false;
        Log.i(TAG, "release bridge handle=" + handle);
        synchronized (videoDecoderLock) {
            releaseVideoDecoderLocked();
        }
        synchronized (audioDecoderLock) {
            releaseAudioDecoderLocked();
        }
        if (NATIVE_AVAILABLE) {
            nativeDestroyBridge(handle);
        }
    }

    private void updateVideoSizeLocked(int resolution) {
        if (resolution == 720) {
            videoWidth = 1280;
            videoHeight = 720;
        } else {
            videoWidth = 1920;
            videoHeight = 1080;
        }
        Log.i(TAG, "updateVideoSize resolution=" + resolution + " video=" + videoWidth + "x" + videoHeight);
        releaseVideoDecoderLocked();
    }

    private boolean ensureVideoDecoderLocked() {
        if (!NATIVE_AVAILABLE || outputSurface == null) {
            return false;
        }
        if (videoDecoder != null) {
            return true;
        }

        try {
            String mime = "video/avc";
            String codecName = NanoMediaCodecHelper.getPreferredDecoderName(mime);
            MediaCodec codec = codecName == null
                    ? MediaCodec.createDecoderByType(mime)
                    : MediaCodec.createByCodecName(codecName);
            MediaFormat format = MediaFormat.createVideoFormat(mime, videoWidth, videoHeight);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, Math.max(4 * 1024 * 1024, videoWidth * videoHeight));
            applyLowLatencyVideoFormat(format, codecName, mime);
            codec.configure(format, outputSurface, null, 0);
            codec.start();
            videoDecoder = codec;
            videoDecoderName = codecName;
            startVideoOutputDrainLocked();
            Log.i(TAG, "Video decoder started: " + (codecName == null ? mime : codecName));
            return true;
        } catch (Throwable error) {
            Log.w(TAG, "Failed to start video decoder", error);
            releaseVideoDecoderLocked();
            return false;
        }
    }

    private void releaseVideoDecoderLocked() {
        stopVideoOutputDrainLocked();
        MediaCodec codec = videoDecoder;
        videoDecoder = null;
        videoDecoderName = null;
        queuedVideoFrameCount = 0L;
        renderedVideoFrameCount = 0L;
        queuedVideoByteCount = 0L;
        firstVideoPresentationTimeUs = Long.MIN_VALUE;
        lastVideoPresentationTimeUs = Long.MIN_VALUE;
        firstVideoRenderPresentationTimeUs = Long.MIN_VALUE;
        firstVideoRenderTimeNs = Long.MIN_VALUE;
        if (codec == null) {
            return;
        }
        Log.i(TAG, "release video decoder");
        try {
            codec.stop();
        } catch (Throwable ignored) {
        }
        try {
            codec.release();
        } catch (Throwable ignored) {
        }
    }

    private void startVideoOutputDrainLocked() {
        if (videoOutputThread != null) {
            return;
        }
        videoOutputDrainRunning = true;
        Thread thread = new Thread(() -> {
            Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY);
            Log.i(TAG, "video output thread started");
            while (videoOutputDrainRunning) {
                MediaCodec codec = videoDecoder;
                if (codec == null) {
                    break;
                }
                if (!drainVideoDecoderOutput(codec, VIDEO_OUTPUT_BUFFER_TIMEOUT_US)) {
                    break;
                }
            }
            Log.i(TAG, "video output thread finished");
        }, "NanoVideoOutput");
        videoOutputThread = thread;
        thread.start();
    }

    private void stopVideoOutputDrainLocked() {
        videoOutputDrainRunning = false;
        Thread thread = videoOutputThread;
        videoOutputThread = null;
        if (thread != null && thread != Thread.currentThread()) {
            try {
                thread.join(VIDEO_OUTPUT_THREAD_JOIN_TIMEOUT_MS);
                if (thread.isAlive()) {
                    Log.w(TAG, "video output thread did not stop within timeout");
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private boolean drainVideoDecoderOutput(MediaCodec codec, long timeoutUs) {
        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
        int outputIndex;
        try {
            outputIndex = codec.dequeueOutputBuffer(bufferInfo, timeoutUs);
        } catch (Throwable error) {
            Log.w(TAG, "Video decoder output dequeue failed", error);
            releaseVideoDecoderAfterOutputFailure();
            return false;
        }

        if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
            return videoOutputDrainRunning;
        }
        if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            try {
                Log.i(TAG, "Video decoder output format changed: " + codec.getOutputFormat());
            } catch (Throwable ignored) {
            }
            return videoOutputDrainRunning;
        }
        if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED || outputIndex < 0) {
            return videoOutputDrainRunning;
        }

        try {
            boolean released = releaseVideoOutputBuffer(codec, outputIndex, bufferInfo.presentationTimeUs, true);
            if (!released) {
                releaseVideoDecoderAfterOutputFailure();
                return false;
            }
            recordRenderedVideoFrame(bufferInfo.presentationTimeUs);
            return videoOutputDrainRunning;
        } catch (Throwable error) {
            Log.w(TAG, "Video decoder output release failed", error);
            releaseVideoDecoderAfterOutputFailure();
            return false;
        }
    }

    private boolean releaseVideoOutputBuffer(MediaCodec codec, int outputIndex, long presentationTimeUs, boolean render) {
        try {
            if (!render) {
                codec.releaseOutputBuffer(outputIndex, false);
                return true;
            }
            long renderTimeNs = getVideoRenderTimeNs(presentationTimeUs);
            if (renderTimeNs <= 0L) {
                codec.releaseOutputBuffer(outputIndex, true);
            } else {
                codec.releaseOutputBuffer(outputIndex, renderTimeNs);
            }
            return true;
        } catch (Throwable error) {
            Log.w(TAG, "Video decoder output release failed", error);
            return false;
        }
    }

    private void recordRenderedVideoFrame(long presentationTimeUs) {
        synchronized (videoDecoderLock) {
            renderedVideoFrameCount += 1;
            if (renderedVideoFrameCount == 1 || renderedVideoFrameCount % 120 == 0) {
                Log.i(TAG, "video output released count=" + renderedVideoFrameCount
                        + " queued=" + queuedVideoFrameCount
                        + " ptsUs=" + presentationTimeUs);
            }
        }
    }

    private void releaseVideoDecoderAfterOutputFailure() {
        synchronized (videoDecoderLock) {
            releaseVideoDecoderLocked();
        }
    }

    private void dropPendingVideoOutputLocked() {
        MediaCodec codec = videoDecoder;
        if (codec == null) {
            return;
        }

        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
        while (true) {
            int outputIndex;
            try {
                outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0);
            } catch (Throwable error) {
                Log.w(TAG, "Video decoder output drop failed", error);
                releaseVideoDecoderLocked();
                return;
            }

            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED
                    || outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                continue;
            }
            if (outputIndex < 0) {
                return;
            }

            try {
                codec.releaseOutputBuffer(outputIndex, false);
            } catch (Throwable error) {
                Log.w(TAG, "Video decoder output drop release failed", error);
                releaseVideoDecoderLocked();
                return;
            }
        }
    }

    private long normalizeVideoPresentationTimeUs(long ptsUs) {
        long normalizedPtsUs = Math.max(0L, ptsUs);
        if (firstVideoPresentationTimeUs == Long.MIN_VALUE) {
            firstVideoPresentationTimeUs = normalizedPtsUs;
            lastVideoPresentationTimeUs = 0L;
            return 0L;
        }

        long codecPtsUs = normalizedPtsUs - firstVideoPresentationTimeUs;
        if (codecPtsUs <= lastVideoPresentationTimeUs) {
            codecPtsUs = lastVideoPresentationTimeUs + 1L;
        }
        lastVideoPresentationTimeUs = codecPtsUs;
        return codecPtsUs;
    }

    private long getVideoRenderTimeNs(long presentationTimeUs) {
        long nowNs = System.nanoTime();
        if (firstVideoRenderPresentationTimeUs == Long.MIN_VALUE) {
            firstVideoRenderPresentationTimeUs = presentationTimeUs;
            firstVideoRenderTimeNs = nowNs + VIDEO_RENDER_START_DELAY_NS;
            return firstVideoRenderTimeNs;
        }

        long targetNs = firstVideoRenderTimeNs
                + Math.max(0L, presentationTimeUs - firstVideoRenderPresentationTimeUs) * 1000L;
        if (targetNs - nowNs > VIDEO_RENDER_MAX_FUTURE_NS) {
            long clampedNs = nowNs + VIDEO_RENDER_START_DELAY_NS;
            firstVideoRenderPresentationTimeUs = presentationTimeUs;
            firstVideoRenderTimeNs = clampedNs;
            return clampedNs;
        }
        if (nowNs - targetNs > VIDEO_RENDER_LATE_THRESHOLD_NS) {
            firstVideoRenderPresentationTimeUs = presentationTimeUs;
            firstVideoRenderTimeNs = nowNs;
            return 0L;
        }
        return targetNs;
    }

    private static void applyLowLatencyVideoFormat(MediaFormat format, @Nullable String codecName, String mime) {
        putFormatInt(format, MediaFormat.KEY_OPERATING_RATE, 32767);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            putFormatInt(format, "priority", 0);
        }
        putFormatInt(format, "allow-frame-drop", 1);
        putFormatInt(format, "low-latency", 1);
        putFormatInt(format, "vdec-lowlatency", 1);
        putFormatInt(format, "vendor.low-latency.enable", 1);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                && NanoMediaCodecHelper.decoderSupportsLowLatency(codecName, mime)) {
            putFormatInt(format, MediaFormat.KEY_LOW_LATENCY, 1);
        }

        String normalizedCodecName = codecName == null ? "" : codecName.toLowerCase(Locale.US);
        if (normalizedCodecName.contains("qcom") || normalizedCodecName.contains("qti")) {
            putFormatInt(format, "vendor.qti-ext-dec-picture-order.enable", 1);
            putFormatInt(format, "vendor.qti-ext-dec-low-latency.enable", 1);
            putFormatInt(format, "vendor.qti-ext-output-sw-fence-enable.value", 1);
            putFormatInt(format, "vendor.qti-ext-output-fence.enable", 1);
            putFormatInt(format, "vendor.qti-ext-output-fence.fence_type", 1);
            putFormatInt(format, "vendor.rtc-ext-dec-low-latency.enable", 1);
        }
        if (isHiSiliconDecoder(normalizedCodecName)) {
            putFormatInt(format, "vendor.hisi-ext-low-latency-video-dec.video-scene-for-low-latency-req", 1);
            putFormatInt(format, "vendor.hisi-ext-low-latency-video-dec.video-scene-for-low-latency-rdy", -1);
        }
        Log.i(TAG, "Applied nano low latency video format codec=" + codecName);
    }

    private static boolean isHiSiliconDecoder(String codecName) {
        String hardware = Build.HARDWARE == null ? "" : Build.HARDWARE.toLowerCase(Locale.US);
        String board = Build.BOARD == null ? "" : Build.BOARD.toLowerCase(Locale.US);
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.US);
        return codecName.contains("hisi")
                || codecName.contains("kirin")
                || hardware.contains("hisi")
                || hardware.contains("kirin")
                || board.contains("hisi")
                || board.contains("kirin")
                || manufacturer.contains("huawei");
    }

    private static void putFormatInt(MediaFormat format, String key, int value) {
        try {
            format.setInteger(key, value);
        } catch (Throwable error) {
            Log.w(TAG, "Failed to set video format key " + key, error);
        }
    }

    private boolean ensureAudioDecoderLocked() {
        if (audioDecoder != null && audioTrack != null) {
            return true;
        }

        try {
            String mime = "audio/opus";
            MediaCodec codec = MediaCodec.createDecoderByType(mime);
            MediaFormat format = MediaFormat.createAudioFormat(mime, audioSampleRate, audioChannelCount);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 4096);
            applyOpusCodecSpecificData(format, audioSampleRate, audioChannelCount);

            int channelConfig = audioChannelCount == 1
                    ? AudioFormat.CHANNEL_OUT_MONO
                    : AudioFormat.CHANNEL_OUT_STEREO;
            int minBufferSize = AudioTrack.getMinBufferSize(
                    audioSampleRate,
                    channelConfig,
                    AudioFormat.ENCODING_PCM_16BIT);
            int bufferSize = Math.max(minBufferSize, audioSampleRate * audioChannelCount * 2 / 10);
            AudioTrack track;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                track = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_GAME)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build())
                        .setAudioFormat(new AudioFormat.Builder()
                                .setSampleRate(audioSampleRate)
                                .setChannelMask(channelConfig)
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .build())
                        .setTransferMode(AudioTrack.MODE_STREAM)
                        .setBufferSizeInBytes(bufferSize)
                        .build();
            } else {
                track = new AudioTrack(
                        AudioManager.STREAM_MUSIC,
                        audioSampleRate,
                        channelConfig,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufferSize,
                        AudioTrack.MODE_STREAM);
            }
            track.play();

            codec.configure(format, null, null, 0);
            codec.start();
            audioDecoder = codec;
            audioTrack = track;
            Log.i(TAG, "Audio decoder started: " + mime
                    + " sampleRate=" + audioSampleRate
                    + " channels=" + audioChannelCount
                    + " bufferSize=" + bufferSize);
            return true;
        } catch (Throwable error) {
            Log.w(TAG, "Failed to start audio decoder", error);
            releaseAudioDecoderLocked();
            return false;
        }
    }

    private void releaseAudioDecoderLocked() {
        MediaCodec codec = audioDecoder;
        AudioTrack track = audioTrack;
        audioDecoder = null;
        audioTrack = null;
        queuedAudioFrameCount = 0L;
        decodedAudioBufferCount = 0L;
        if (codec != null) {
            Log.i(TAG, "release audio decoder");
            try {
                codec.stop();
            } catch (Throwable ignored) {
            }
            try {
                codec.release();
            } catch (Throwable ignored) {
            }
        }
        if (track != null) {
            Log.i(TAG, "release audio track");
            try {
                track.pause();
            } catch (Throwable ignored) {
            }
            try {
                track.flush();
            } catch (Throwable ignored) {
            }
            try {
                track.release();
            } catch (Throwable ignored) {
            }
        }
    }

    private void drainAudioDecoderLocked() {
        MediaCodec codec = audioDecoder;
        AudioTrack track = audioTrack;
        if (codec == null || track == null) {
            return;
        }

        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
        while (true) {
            int outputIndex;
            try {
                outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0);
            } catch (Throwable error) {
                Log.w(TAG, "Audio decoder drain failed", error);
                releaseAudioDecoderLocked();
                return;
            }

            if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                return;
            }
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat format = codec.getOutputFormat();
                Log.i(TAG, "Audio decoder output format changed: " + format);
                continue;
            }
            if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                continue;
            }
            if (outputIndex < 0) {
                return;
            }

            try {
                ByteBuffer outputBuffer = codec.getOutputBuffer(outputIndex);
                if (outputBuffer != null && bufferInfo.size > 0) {
                    outputBuffer.position(bufferInfo.offset);
                    outputBuffer.limit(bufferInfo.offset + bufferInfo.size);
                    int written;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        written = track.write(outputBuffer, bufferInfo.size, AudioTrack.WRITE_BLOCKING);
                    } else {
                        byte[] pcm = new byte[bufferInfo.size];
                        outputBuffer.get(pcm);
                        written = track.write(pcm, 0, pcm.length);
                    }
                    decodedAudioBufferCount += 1;
                    if (decodedAudioBufferCount == 1 || decodedAudioBufferCount % 300 == 0) {
                        Log.i(TAG, "audio pcm written count=" + decodedAudioBufferCount
                                + " bytes=" + bufferInfo.size
                                + " written=" + written
                                + " ptsUs=" + bufferInfo.presentationTimeUs);
                    }
                }
                codec.releaseOutputBuffer(outputIndex, false);
            } catch (Throwable error) {
                Log.w(TAG, "Audio decoder output failed", error);
                releaseAudioDecoderLocked();
                return;
            }
        }
    }

    private static void applyOpusCodecSpecificData(MediaFormat format, int sampleRate, int channelCount) {
        ByteBuffer opusHead = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN);
        opusHead.put((byte) 'O');
        opusHead.put((byte) 'p');
        opusHead.put((byte) 'u');
        opusHead.put((byte) 's');
        opusHead.put((byte) 'H');
        opusHead.put((byte) 'e');
        opusHead.put((byte) 'a');
        opusHead.put((byte) 'd');
        opusHead.put((byte) 1);
        opusHead.put((byte) Math.max(1, Math.min(2, channelCount)));
        opusHead.putShort((short) 0);
        opusHead.putInt(sampleRate);
        opusHead.putShort((short) 0);
        opusHead.put((byte) 0);
        opusHead.flip();
        format.setByteBuffer("csd-0", opusHead);

        ByteBuffer codecDelayNs = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        codecDelayNs.putLong(0L);
        codecDelayNs.flip();
        format.setByteBuffer("csd-1", codecDelayNs);

        ByteBuffer seekPreRollNs = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        seekPreRollNs.putLong(80_000_000L);
        seekPreRollNs.flip();
        format.setByteBuffer("csd-2", seekPreRollNs);
    }

    public long getQueuedVideoFrameCount() {
        synchronized (videoDecoderLock) {
            return queuedVideoFrameCount;
        }
    }

    public long getRenderedVideoFrameCount() {
        synchronized (videoDecoderLock) {
            return renderedVideoFrameCount;
        }
    }

    public long getQueuedVideoByteCount() {
        synchronized (videoDecoderLock) {
            return queuedVideoByteCount;
        }
    }

    public int getVideoWidth() {
        synchronized (videoDecoderLock) {
            return videoWidth;
        }
    }

    public int getVideoHeight() {
        synchronized (videoDecoderLock) {
            return videoHeight;
        }
    }

    public long getQueuedAudioFrameCount() {
        synchronized (audioDecoderLock) {
            return queuedAudioFrameCount;
        }
    }

    public long getDecodedAudioBufferCount() {
        synchronized (audioDecoderLock) {
            return decodedAudioBufferCount;
        }
    }

    public String getSessionStage() {
        return sessionStage;
    }

    public String getSessionStatusText() {
        return sessionStatusText;
    }

    public boolean hasTerminalSessionError() {
        return terminalSessionError;
    }

    public double getWebRtcRttMs() {
        return webRtcRttMs;
    }

    public double getWebRtcJitterMs() {
        return webRtcJitterMs;
    }

    public double getWebRtcFps() {
        return webRtcFps;
    }

    public double getWebRtcFramesDropped() {
        return webRtcFramesDropped;
    }

    public double getWebRtcFramesReceived() {
        return webRtcFramesReceived;
    }

    public double getWebRtcPacketsLost() {
        return webRtcPacketsLost;
    }

    public double getWebRtcPacketsReceived() {
        return webRtcPacketsReceived;
    }

    public double getWebRtcPacketLossPercent() {
        return webRtcPacketLossPercent;
    }

    public double getWebRtcBitrateMbps() {
        return webRtcBitrateMbps;
    }

    public double getWebRtcDecodeMs() {
        return webRtcDecodeMs;
    }

    private static String safeLog(@Nullable String value) {
        return value == null ? "" : value;
    }

    private native long nativeCreateBridge();

    private static native void nativeDestroyBridge(long handle);

    private static native void nativeSetStreamInfo(
            long handle,
            String sessionId,
            String streamType,
            String renderEngine,
            String baseUri,
            String gsToken,
            String webToken,
            int resolution,
            String preferredLanguage,
            String iceServerUrl,
            String iceServerUsername,
            String iceServerCredential,
            boolean stereoAudioEnabled,
            boolean coop,
            boolean hasWebToken,
            boolean hasStreamingTokens,
            boolean authReady);

    private static native void nativeSetSurface(long handle, @Nullable Surface surface, int width, int height);

    private static native void nativeStart(long handle);

    private static native void nativeStop(long handle);

    private static native void nativeSendGamepadState(
            long handle,
            int gamepadIndex,
            int nexus,
            int menu,
            int view,
            int a,
            int b,
            int x,
            int y,
            int dpadUp,
            int dpadDown,
            int dpadLeft,
            int dpadRight,
            int leftShoulder,
            int rightShoulder,
            int leftThumb,
            int rightThumb,
            float leftThumbXAxis,
            float leftThumbYAxis,
            float rightThumbXAxis,
            float rightThumbYAxis,
            float leftTrigger,
            float rightTrigger);

    private static native void nativeReleaseSurface(long handle);
}
