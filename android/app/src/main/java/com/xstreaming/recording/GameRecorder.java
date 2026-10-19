package com.xstreaming.recording;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import androidx.annotation.Nullable;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class GameRecorder {
    private static final String TAG = "GameRecorder";
    private static volatile GameRecorder sInstance;

    private static volatile byte[] sStaticSps;
    private static volatile byte[] sStaticPps;

    private final Object mLock = new Object();
    private HandlerThread mWorkerThread;
    private Handler mWorkerHandler;

    private MediaMuxer mMuxer;
    private MediaCodec mAudioEncoder;
    private int mVideoTrackIndex = -1;
    private int mAudioTrackIndex = -1;
    private boolean mMuxerStarted = false;
    private volatile boolean mIsRecording = false;
    private volatile boolean mFirstKeyframeReceived = false;
    private long mRecordRequestedNs = -1L;

    private String mCurrentFilePath;
    private Context mAppContext;

    private long mRecordStartNs = -1L;
    private long mLastVideoPtsUs = -1L;
    private long mLastAudioPtsUs = -1L;
    private int mWrittenVideoFrames = 0;
    private int mWrittenAudioFrames = 0;

    private byte[] mCachedSps;
    private byte[] mCachedPps;
    private int mRecordWidth = 1920;
    private int mRecordHeight = 1080;
    private int mAudioSampleRate = 48000;
    private int mAudioChannelCount = 2;

    public interface RecordCallback {
        void onStarted(String filePath);
        void onStopped(String filePath);
        void onError(String message);
    }

    private RecordCallback mCallback;

    private GameRecorder() {}

    public static GameRecorder getInstance() {
        if (sInstance == null) {
            synchronized (GameRecorder.class) {
                if (sInstance == null) {
                    sInstance = new GameRecorder();
                }
            }
        }
        return sInstance;
    }

    public void init(Context context) {
        mAppContext = context.getApplicationContext();
    }

    public void setCallback(RecordCallback callback) {
        synchronized (mLock) {
            mCallback = callback;
        }
    }

    public boolean isRecording() {
        return mIsRecording;
    }

    @Nullable
    public String getCurrentFilePath() {
        return mCurrentFilePath;
    }

    public void startRecording(int width, int height, @Nullable String customPath, @Nullable RecordCallback callback) {
        synchronized (mLock) {
            if (mIsRecording) {
                if (callback != null) {
                    callback.onError("Recording already in progress");
                }
                return;
            }

            if (callback != null) {
                mCallback = callback;
            }

            mRecordWidth = width > 0 ? width : 1920;
            mRecordHeight = height > 0 ? height : 1080;
            mCachedSps = sStaticSps;
            mCachedPps = sStaticPps;
            mRecordStartNs = -1L;
            mLastVideoPtsUs = -1L;
            mLastAudioPtsUs = -1L;
            mWrittenVideoFrames = 0;
            mWrittenAudioFrames = 0;
            mVideoTrackIndex = -1;
            mAudioTrackIndex = -1;
            mMuxerStarted = false;
            mFirstKeyframeReceived = false;
            mRecordRequestedNs = System.nanoTime();

            mWorkerThread = new HandlerThread("GameRecorderWorker");
            mWorkerThread.start();
            mWorkerHandler = new Handler(mWorkerThread.getLooper());

            String targetPath = customPath;
            if (targetPath == null || targetPath.isEmpty()) {
                targetPath = generateOutputPath();
            }
            mCurrentFilePath = targetPath;

            try {
                File file = new File(mCurrentFilePath);
                File parent = file.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                mMuxer = new MediaMuxer(mCurrentFilePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            } catch (IOException e) {
                Log.e(TAG, "Failed to create MediaMuxer", e);
                cleanupLocked();
                if (mCallback != null) {
                    mCallback.onError("Failed to initialize video muxer: " + e.getMessage());
                }
                return;
            }

            initAudioEncoderLocked(mAudioSampleRate, mAudioChannelCount);

            if (mCachedSps != null && mCachedPps != null) {
                initTracksAndStartMuxerLocked();
            }

            mIsRecording = true;
            Log.i(TAG, "Recording started: " + mCurrentFilePath);

            if (mCallback != null) {
                mCallback.onStarted(mCurrentFilePath);
            }
        }
    }

    public void stopRecording(@Nullable RecordCallback callback) {
        synchronized (mLock) {
            if (!mIsRecording) {
                if (callback != null) {
                    callback.onError("Not currently recording");
                }
                return;
            }

            mIsRecording = false;
            mFirstKeyframeReceived = false;
            final String savedPath = mCurrentFilePath;
            final RecordCallback cb = callback != null ? callback : mCallback;

            if (mWorkerHandler != null) {
                mWorkerHandler.post(() -> {
                    synchronized (mLock) {
                        drainAudioEncoderLocked(true);
                        stopMuxerLocked();
                        cleanupLocked();

                        File f = new File(savedPath);
                        if (f.exists() && f.length() > 0 && mWrittenVideoFrames > 0) {
                            scanSavedFile(savedPath);
                            if (cb != null) {
                                cb.onStopped(savedPath);
                            }
                        } else {
                            if (f.exists()) {
                                f.delete();
                            }
                            if (cb != null) {
                                cb.onError("Recording stopped with no frames captured");
                            }
                        }
                    }
                });
            } else {
                stopMuxerLocked();
                cleanupLocked();
                File f = new File(savedPath);
                if (f.exists() && f.length() > 0 && mWrittenVideoFrames > 0) {
                    scanSavedFile(savedPath);
                    if (cb != null) {
                        cb.onStopped(savedPath);
                    }
                } else {
                    if (f.exists()) {
                        f.delete();
                    }
                    if (cb != null) {
                        cb.onError("Recording stopped with no frames captured");
                    }
                }
            }
        }
    }

    public void cacheSpsPps(ByteBuffer buffer) {
        if (buffer == null) {
            return;
        }
        try {
            ByteBuffer directBuffer = buffer.duplicate();
            if (directBuffer.remaining() > 4) {
                extractSpsPpsAndCheckKeyframe(directBuffer);
            }
        } catch (Throwable ignored) {
        }
    }

    public void feedVideoFrame(ByteBuffer buffer, long ptsUs, boolean isKeyframe, int width, int height) {
        if (!mIsRecording || buffer == null) {
            return;
        }

        ByteBuffer directBuffer = buffer.duplicate();
        if (directBuffer.remaining() <= 4) {
            return;
        }

        boolean keyFound = extractSpsPpsAndCheckKeyframe(directBuffer);
        boolean effectiveKeyframe = isKeyframe || keyFound;

        if (width > 0 && height > 0) {
            mRecordWidth = width;
            mRecordHeight = height;
        }

        synchronized (mLock) {
            if (!mIsRecording || mWorkerHandler == null) {
                return;
            }

            if (!mFirstKeyframeReceived) {
                boolean timeout = (System.nanoTime() - mRecordRequestedNs) > 1500000000L;
                if (!effectiveKeyframe && !timeout) {
                    return;
                }
                if (mCachedSps == null || mCachedPps == null) {
                    return;
                }
                if (!mMuxerStarted) {
                    initTracksAndStartMuxerLocked();
                }
                if (!mMuxerStarted) {
                    return;
                }
                mFirstKeyframeReceived = true;
                mRecordStartNs = System.nanoTime();
            }

            if (!mMuxerStarted) {
                return;
            }

            final byte[] frameBytes = new byte[directBuffer.remaining()];
            directBuffer.get(frameBytes);

            mWorkerHandler.post(() -> {
                synchronized (mLock) {
                    if (!mMuxerStarted || mMuxer == null || mVideoTrackIndex < 0) {
                        return;
                    }

                    long nowNs = System.nanoTime();
                    if (mRecordStartNs < 0) {
                        mRecordStartNs = nowNs;
                    }
                    long adjustedPts = Math.max(0, (nowNs - mRecordStartNs) / 1000L);

                    if (adjustedPts <= mLastVideoPtsUs) {
                        adjustedPts = mLastVideoPtsUs + 1000L;
                    }
                    mLastVideoPtsUs = adjustedPts;

                    ByteBuffer writeBuffer = ByteBuffer.wrap(frameBytes);
                    MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
                    info.offset = 0;
                    info.size = frameBytes.length;
                    info.presentationTimeUs = adjustedPts;
                    info.flags = effectiveKeyframe ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;

                    try {
                        mMuxer.writeSampleData(mVideoTrackIndex, writeBuffer, info);
                        mWrittenVideoFrames++;
                    } catch (Throwable e) {
                        Log.e(TAG, "Error writing video frame", e);
                    }
                }
            });
        }
    }

    public void feedPcmAudio(ByteBuffer pcmBuffer, long ptsUs, int sampleRate, int channelCount) {
        if (!mIsRecording || !mFirstKeyframeReceived || pcmBuffer == null) {
            return;
        }

        if (sampleRate > 0) {
            mAudioSampleRate = sampleRate;
        }
        if (channelCount > 0) {
            mAudioChannelCount = channelCount;
        }

        ByteBuffer directBuffer = pcmBuffer.duplicate();
        final byte[] pcmBytes = new byte[directBuffer.remaining()];
        directBuffer.get(pcmBytes);

        synchronized (mLock) {
            if (!mIsRecording || !mFirstKeyframeReceived || mWorkerHandler == null) {
                return;
            }

            mWorkerHandler.post(() -> {
                synchronized (mLock) {
                    if (!mIsRecording || !mFirstKeyframeReceived) {
                        return;
                    }

                    if (mAudioEncoder == null) {
                        initAudioEncoderLocked(mAudioSampleRate, mAudioChannelCount);
                    }

                    if (mAudioEncoder == null) {
                        return;
                    }

                    long nowNs = System.nanoTime();
                    if (mRecordStartNs < 0) {
                        mRecordStartNs = nowNs;
                    }
                    long framePtsUs = Math.max(0, (nowNs - mRecordStartNs) / 1000L);

                    try {
                        int inputIndex = mAudioEncoder.dequeueInputBuffer(1000);
                        if (inputIndex >= 0) {
                            ByteBuffer inputBuffer = mAudioEncoder.getInputBuffer(inputIndex);
                            if (inputBuffer != null) {
                                inputBuffer.clear();
                                int toWrite = Math.min(inputBuffer.remaining(), pcmBytes.length);
                                inputBuffer.put(pcmBytes, 0, toWrite);
                                mAudioEncoder.queueInputBuffer(inputIndex, 0, toWrite, framePtsUs, 0);
                            }
                        }
                        drainAudioEncoderLocked(false);
                    } catch (Throwable e) {
                        Log.e(TAG, "Error encoding audio frame", e);
                    }
                }
            });
        }
    }

    private boolean extractSpsPpsAndCheckKeyframe(ByteBuffer buffer) {
        int originalPos = buffer.position();
        byte[] data = new byte[buffer.remaining()];
        buffer.get(data);
        buffer.position(originalPos);

        int length = data.length;
        int i = 0;
        int prevNalStart = -1;
        int prevNalType = -1;
        boolean hasKeyframeNal = false;

        while (i < length - 4) {
            int startCodeLen = 0;
            if (data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1) {
                startCodeLen = 3;
            } else if (data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 0 && data[i + 3] == 1) {
                startCodeLen = 4;
            }

            if (startCodeLen > 0) {
                if (prevNalStart != -1) {
                    saveNalIfSpsOrPps(data, prevNalStart, i, prevNalType);
                }
                prevNalStart = i;
                prevNalType = data[i + startCodeLen] & 0x1F;
                if (prevNalType == 5 || prevNalType == 7) {
                    hasKeyframeNal = true;
                }
                i += startCodeLen;
            } else {
                i++;
            }
        }

        if (prevNalStart != -1 && prevNalStart < length) {
            saveNalIfSpsOrPps(data, prevNalStart, length, prevNalType);
            if (prevNalType == 5 || prevNalType == 7) {
                hasKeyframeNal = true;
            }
        }

        return hasKeyframeNal;
    }

    private void saveNalIfSpsOrPps(byte[] data, int start, int end, int nalType) {
        if (nalType == 7) {
            byte[] sps = new byte[end - start];
            System.arraycopy(data, start, sps, 0, end - start);
            sStaticSps = sps;
            mCachedSps = sps;
            Log.i(TAG, "Cached SPS: " + sps.length + " bytes");
        } else if (nalType == 8) {
            byte[] pps = new byte[end - start];
            System.arraycopy(data, start, pps, 0, end - start);
            sStaticPps = pps;
            mCachedPps = pps;
            Log.i(TAG, "Cached PPS: " + pps.length + " bytes");
        }
    }

    private void initAudioEncoderLocked(int sampleRate, int channelCount) {
        try {
            MediaFormat format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channelCount);
            format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            format.setInteger(MediaFormat.KEY_BIT_RATE, 128000);
            format.setInteger(MediaFormat.KEY_CHANNEL_COUNT, channelCount);
            format.setInteger(MediaFormat.KEY_SAMPLE_RATE, sampleRate);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);

            mAudioEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
            mAudioEncoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            mAudioEncoder.start();
            Log.i(TAG, "Audio encoder configured and started for " + sampleRate + "Hz " + channelCount + "ch");
        } catch (Throwable e) {
            Log.e(TAG, "Failed to initialize audio encoder", e);
        }
    }

    private void initTracksAndStartMuxerLocked() {
        if (mMuxerStarted || mMuxer == null || mCachedSps == null || mCachedPps == null) {
            return;
        }

        try {
            MediaFormat videoFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, mRecordWidth, mRecordHeight);
            videoFormat.setByteBuffer("csd-0", ByteBuffer.wrap(mCachedSps));
            videoFormat.setByteBuffer("csd-1", ByteBuffer.wrap(mCachedPps));
            mVideoTrackIndex = mMuxer.addTrack(videoFormat);

            MediaFormat audioFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, mAudioSampleRate, mAudioChannelCount);
            audioFormat.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            audioFormat.setInteger(MediaFormat.KEY_BIT_RATE, 128000);
            audioFormat.setInteger(MediaFormat.KEY_CHANNEL_COUNT, mAudioChannelCount);
            audioFormat.setInteger(MediaFormat.KEY_SAMPLE_RATE, mAudioSampleRate);
            byte[] csd0 = getAacCsd0(mAudioSampleRate, mAudioChannelCount);
            audioFormat.setByteBuffer("csd-0", ByteBuffer.wrap(csd0));
            mAudioTrackIndex = mMuxer.addTrack(audioFormat);

            mMuxer.start();
            mMuxerStarted = true;
            Log.i(TAG, "MediaMuxer started. VideoTrack: " + mVideoTrackIndex + ", AudioTrack: " + mAudioTrackIndex);
        } catch (Throwable e) {
            Log.e(TAG, "Failed to start MediaMuxer", e);
        }
    }

    private static byte[] getAacCsd0(int sampleRate, int channelCount) {
        int sampleRateIndex;
        switch (sampleRate) {
            case 96000: sampleRateIndex = 0; break;
            case 88200: sampleRateIndex = 1; break;
            case 64000: sampleRateIndex = 2; break;
            case 48000: sampleRateIndex = 3; break;
            case 44100: sampleRateIndex = 4; break;
            case 32000: sampleRateIndex = 5; break;
            case 24000: sampleRateIndex = 6; break;
            case 22050: sampleRateIndex = 7; break;
            case 16000: sampleRateIndex = 8; break;
            case 12000: sampleRateIndex = 9; break;
            case 11025: sampleRateIndex = 10; break;
            case 8000: sampleRateIndex = 11; break;
            case 7350: sampleRateIndex = 12; break;
            default: sampleRateIndex = 3; break;
        }
        int audioObjectType = 2;
        byte byte1 = (byte) ((audioObjectType << 3) | ((sampleRateIndex >> 1) & 0x07));
        byte byte2 = (byte) (((sampleRateIndex & 0x01) << 7) | ((channelCount & 0x0F) << 3));
        return new byte[]{byte1, byte2};
    }

    private void drainAudioEncoderLocked(boolean endOfStream) {
        if (mAudioEncoder == null) {
            return;
        }

        if (endOfStream) {
            try {
                int inputIndex = mAudioEncoder.dequeueInputBuffer(10000);
                if (inputIndex >= 0) {
                    mAudioEncoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                }
            } catch (Throwable ignored) {
            }
        }

        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
        while (true) {
            int outputIndex = mAudioEncoder.dequeueOutputBuffer(bufferInfo, 0);
            if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                break;
            }
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                continue;
            }
            if (outputIndex >= 0) {
                ByteBuffer outputBuffer = mAudioEncoder.getOutputBuffer(outputIndex);
                if (outputBuffer != null) {
                    if ((bufferInfo.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                        bufferInfo.size = 0;
                    }
                    if (bufferInfo.size > 0 && mMuxerStarted && mAudioTrackIndex >= 0) {
                        outputBuffer.position(bufferInfo.offset);
                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size);

                        if (bufferInfo.presentationTimeUs <= mLastAudioPtsUs) {
                            bufferInfo.presentationTimeUs = mLastAudioPtsUs + 500L;
                        }
                        mLastAudioPtsUs = bufferInfo.presentationTimeUs;

                        try {
                            mMuxer.writeSampleData(mAudioTrackIndex, outputBuffer, bufferInfo);
                            mWrittenAudioFrames++;
                        } catch (Throwable e) {
                            Log.e(TAG, "Failed writing audio sample", e);
                        }
                    }
                }
                mAudioEncoder.releaseOutputBuffer(outputIndex, false);
                if ((bufferInfo.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    break;
                }
            }
        }
    }

    private void stopMuxerLocked() {
        if (mMuxer != null) {
            if (mMuxerStarted && mWrittenVideoFrames > 0) {
                try {
                    mMuxer.stop();
                    Log.i(TAG, "MediaMuxer stopped. VideoFrames: " + mWrittenVideoFrames + ", AudioFrames: " + mWrittenAudioFrames);
                } catch (Throwable e) {
                    Log.w(TAG, "Error stopping MediaMuxer", e);
                }
            } else {
                Log.w(TAG, "Muxer stopped without frames written. started=" + mMuxerStarted + " frames=" + mWrittenVideoFrames);
            }
            try {
                mMuxer.release();
            } catch (Throwable ignored) {
            }
            mMuxer = null;
            mMuxerStarted = false;
        }

        if (mAudioEncoder != null) {
            try {
                mAudioEncoder.stop();
            } catch (Throwable ignored) {
            }
            try {
                mAudioEncoder.release();
            } catch (Throwable ignored) {
            }
            mAudioEncoder = null;
        }
    }

    private void cleanupLocked() {
        if (mWorkerThread != null) {
            mWorkerThread.quitSafely();
            mWorkerThread = null;
            mWorkerHandler = null;
        }
    }

    private String generateOutputPath() {
        File baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES);
        File recordDir = new File(baseDir, "XStreaming");
        if (!recordDir.exists()) {
            if (!recordDir.mkdirs() && mAppContext != null) {
                recordDir = mAppContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
            }
        }

        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        return new File(recordDir, "gameplay_" + timeStamp + ".mp4").getAbsolutePath();
    }

    private void scanSavedFile(String path) {
        if (mAppContext == null || path == null) {
            return;
        }
        MediaScannerConnection.scanFile(
                mAppContext,
                new String[]{path},
                new String[]{"video/mp4"},
                (scannedPath, uri) -> Log.i(TAG, "Scanned into MediaStore: " + uri)
        );
    }
}
