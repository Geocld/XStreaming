package com.xstreaming.nano;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import androidx.annotation.Nullable;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public final class NanoRustBridge {
    private static final String TAG = "NanoRustBridge";
    private static final boolean NATIVE_AVAILABLE;
    private static final long VIDEO_OUTPUT_DRAIN_INTERVAL_MS = 1L;

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
    private long videoInputTimestampUs = 0L;
    @Nullable
    private HandlerThread videoOutputThread;
    @Nullable
    private Handler videoOutputHandler;
    private volatile boolean videoOutputDrainRunning = false;
    private final Runnable videoOutputDrainRunnable = new Runnable() {
        @Override
        public void run() {
            synchronized (videoDecoderLock) {
                if (videoOutputDrainRunning && videoDecoder != null) {
                    drainVideoDecoderLocked();
                }
            }
            Handler handler = videoOutputHandler;
            if (videoOutputDrainRunning && handler != null) {
                handler.postDelayed(this, VIDEO_OUTPUT_DRAIN_INTERVAL_MS);
            }
        }
    };
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
        return NATIVE_AVAILABLE && nativeHandle != 0L;
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
            ensureVideoDecoderLocked();
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
            ensureVideoDecoderLocked();
        }
        nativeSetSurface(nativeHandle, surface, width, height);
    }

    public void start() {
        if (!isNativeAvailable()) {
            Log.w(TAG, "start skipped native unavailable");
            return;
        }
        Log.i(TAG, "start requested handle=" + nativeHandle);
        synchronized (videoDecoderLock) {
            ensureVideoDecoderLocked();
        }
        nativeStart(nativeHandle);
    }

    public void stop() {
        if (!isNativeAvailable()) {
            Log.w(TAG, "stop skipped native unavailable");
            return;
        }
        Log.i(TAG, "stop requested handle=" + nativeHandle);
        nativeStop(nativeHandle);
        synchronized (videoDecoderLock) {
            releaseVideoDecoderLocked();
        }
        synchronized (audioDecoderLock) {
            releaseAudioDecoderLocked();
        }
    }

    public void releaseSurface() {
        if (!isNativeAvailable()) {
            Log.w(TAG, "releaseSurface skipped native unavailable");
            return;
        }
        Log.i(TAG, "releaseSurface requested handle=" + nativeHandle);
        synchronized (videoDecoderLock) {
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

    public void queueVideoFrame(byte[] data, long ptsUs, boolean keyframe) {
        if (!isNativeAvailable()) {
            Log.w(TAG, "queueVideoFrame skipped native unavailable");
            return;
        }
        synchronized (videoDecoderLock) {
            if (videoDecoder == null && !ensureVideoDecoderLocked()) {
                return;
            }
            if (videoDecoder == null) {
                return;
            }

            try {
                int inputIndex = videoDecoder.dequeueInputBuffer(0);
                if (inputIndex < 0) {
                    drainVideoDecoderLocked();
                    inputIndex = videoDecoder.dequeueInputBuffer(0);
                }
                if (inputIndex < 0) {
                    return;
                }

                ByteBuffer inputBuffer = videoDecoder.getInputBuffer(inputIndex);
                if (inputBuffer == null) {
                    Log.w(TAG, "Video decoder input buffer is null index=" + inputIndex);
                    releaseVideoDecoderLocked();
                    return;
                }

                inputBuffer.clear();
                if (data.length > inputBuffer.remaining()) {
                    Log.w(TAG, "Video frame too large data=" + data.length + " remaining=" + inputBuffer.remaining());
                    releaseVideoDecoderLocked();
                    return;
                }
                inputBuffer.put(data);
                int flags = keyframe ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                long codecPtsUs = videoInputTimestampUs++;
                videoDecoder.queueInputBuffer(inputIndex, 0, data.length, codecPtsUs, flags);
                queuedVideoFrameCount += 1;
                queuedVideoByteCount += data.length;
                if (queuedVideoFrameCount == 1 || keyframe || queuedVideoFrameCount % 120 == 0) {
                    Log.i(TAG, "queueVideoFrame count=" + queuedVideoFrameCount
                            + " bytes=" + data.length
                            + " sourcePtsUs=" + ptsUs
                            + " codecPtsUs=" + codecPtsUs
                            + " keyframe=" + keyframe);
                }
                drainVideoDecoderLocked();
                if (queuedVideoFrameCount % 120 == 0
                        && queuedVideoFrameCount > renderedVideoFrameCount + 240) {
                    Log.w(TAG, "Video decoder output lag queued=" + queuedVideoFrameCount
                            + " rendered=" + renderedVideoFrameCount);
                }
            } catch (Throwable error) {
                Log.w(TAG, "Video frame queue failed", error);
                releaseVideoDecoderLocked();
            }
        }
    }

    public void dropPendingVideoOutput(@Nullable String reason) {
        Log.w(TAG, "dropPendingVideoOutput reason=" + (reason == null ? "" : reason));
        synchronized (videoDecoderLock) {
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
    }

    public void queueAudioFrame(byte[] data, long ptsUs, int sampleRate, int channelCount) {
        if (!isNativeAvailable()) {
            Log.w(TAG, "queueAudioFrame skipped native unavailable");
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

                inputBuffer.clear();
                if (data.length > inputBuffer.remaining()) {
                    Log.w(TAG, "Audio frame too large data=" + data.length + " remaining=" + inputBuffer.remaining());
                    return;
                }
                inputBuffer.put(data);
                audioDecoder.queueInputBuffer(inputIndex, 0, data.length, Math.max(0L, ptsUs), 0);
                queuedAudioFrameCount += 1;
                if (queuedAudioFrameCount == 1 || queuedAudioFrameCount % 300 == 0) {
                    Log.i(TAG, "queueAudioFrame count=" + queuedAudioFrameCount
                            + " bytes=" + data.length
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
        Log.i(TAG, "release bridge handle=" + nativeHandle);
        synchronized (videoDecoderLock) {
            releaseVideoDecoderLocked();
        }
        synchronized (audioDecoderLock) {
            releaseAudioDecoderLocked();
        }
        if (NATIVE_AVAILABLE) {
            nativeDestroyBridge(nativeHandle);
        }
        nativeHandle = 0L;
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
            format.setInteger(MediaFormat.KEY_OPERATING_RATE, 32767);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    && NanoMediaCodecHelper.decoderSupportsLowLatency(codecName, mime)) {
                try {
                    format.setInteger(MediaFormat.KEY_LOW_LATENCY, 1);
                } catch (Throwable ignored) {
                }
            }
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
        videoInputTimestampUs = 0L;
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
        HandlerThread thread = new HandlerThread("NanoVideoOutput");
        thread.start();
        Handler handler = new Handler(thread.getLooper());
        videoOutputThread = thread;
        videoOutputHandler = handler;
        handler.post(videoOutputDrainRunnable);
        Log.i(TAG, "video output drain thread started");
    }

    private void stopVideoOutputDrainLocked() {
        videoOutputDrainRunning = false;
        Handler handler = videoOutputHandler;
        HandlerThread thread = videoOutputThread;
        videoOutputHandler = null;
        videoOutputThread = null;
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        if (thread != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                thread.quitSafely();
            } else {
                thread.quit();
            }
            Log.i(TAG, "video output drain thread stopped");
        }
    }

    private void drainVideoDecoderLocked() {
        MediaCodec codec = videoDecoder;
        if (codec == null) {
            return;
        }

        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
        int latestOutputIndex = -1;
        long latestPresentationTimeUs = 0L;
        while (true) {
            int outputIndex;
            try {
                outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0);
            } catch (Throwable error) {
                Log.w(TAG, "Video decoder drain failed", error);
                releaseVideoDecoderLocked();
                return;
            }

            if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                break;
            }
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED
                    || outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                continue;
            }
            if (outputIndex < 0) {
                break;
            }

            try {
                if (latestOutputIndex >= 0) {
                    codec.releaseOutputBuffer(latestOutputIndex, false);
                }
                latestOutputIndex = outputIndex;
                latestPresentationTimeUs = bufferInfo.presentationTimeUs;
            } catch (Throwable error) {
                Log.w(TAG, "Video decoder output release failed", error);
                releaseVideoDecoderLocked();
                return;
            }
        }

        if (latestOutputIndex < 0) {
            return;
        }

        try {
            releaseVideoOutputBufferNow(codec, latestOutputIndex);
            renderedVideoFrameCount += 1;
            if (renderedVideoFrameCount == 1 || renderedVideoFrameCount % 120 == 0) {
                Log.i(TAG, "video output rendered count=" + renderedVideoFrameCount
                        + " queued=" + queuedVideoFrameCount
                        + " ptsUs=" + latestPresentationTimeUs);
            }
        } catch (Throwable error) {
            Log.w(TAG, "Video decoder latest output release failed", error);
            releaseVideoDecoderLocked();
        }
    }

    private void releaseVideoOutputBufferNow(MediaCodec codec, int outputIndex) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                codec.releaseOutputBuffer(outputIndex, System.nanoTime());
                return;
            } catch (Throwable error) {
                Log.w(TAG, "Video decoder timed output release failed, fallback render=true", error);
            }
        }
        codec.releaseOutputBuffer(outputIndex, true);
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
