package com.xstreaming.webrtc;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.xstreaming.recording.GameRecorder;

import java.nio.ByteBuffer;

public class DelegatingAudioTrack extends AudioTrack {
    private static final String TAG = "DelegatingAudioTrack";
    private final AudioTrack mDelegate;
    private final int mSampleRate;
    private final int mChannelCount;

    public DelegatingAudioTrack(@NonNull AudioTrack delegate) {
        super(
                getSafeAttributes(delegate),
                getSafeFormat(delegate),
                Math.max(4096, getSafeBufferSize(delegate)),
                AudioTrack.MODE_STREAM,
                AudioManager.AUDIO_SESSION_ID_GENERATE
        );
        this.mDelegate = delegate;
        this.mSampleRate = delegate.getSampleRate() > 0 ? delegate.getSampleRate() : 48000;
        this.mChannelCount = delegate.getChannelCount() > 0 ? delegate.getChannelCount() : 2;
        try {
            super.pause();
        } catch (Throwable ignored) {
        }
    }

    private static AudioAttributes getSafeAttributes(AudioTrack delegate) {
        try {
            AudioAttributes attr = delegate.getAudioAttributes();
            if (attr != null) {
                return attr;
            }
        } catch (Throwable ignored) {
        }
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
    }

    private static AudioFormat getSafeFormat(AudioTrack delegate) {
        try {
            AudioFormat format = delegate.getFormat();
            if (format != null) {
                return format;
            }
        } catch (Throwable ignored) {
        }
        int sr = delegate.getSampleRate() > 0 ? delegate.getSampleRate() : 48000;
        int ch = delegate.getChannelCount() == 1 ? AudioFormat.CHANNEL_OUT_MONO : AudioFormat.CHANNEL_OUT_STEREO;
        return new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sr)
                .setChannelMask(ch)
                .build();
    }

    private static int getSafeBufferSize(AudioTrack delegate) {
        try {
            int capacity = delegate.getBufferCapacityInFrames();
            if (capacity > 0) {
                return capacity * 4;
            }
        } catch (Throwable ignored) {
        }
        return 8192;
    }

    @Override
    public int write(@NonNull ByteBuffer audioData, int sizeInBytes, int writeMode) {
        if (GameRecorder.getInstance().isRecording() && sizeInBytes > 0) {
            try {
                int pos = audioData.position();
                int limit = audioData.limit();
                ByteBuffer copy = audioData.duplicate();
                copy.position(pos);
                copy.limit(Math.min(limit, pos + sizeInBytes));
                GameRecorder.getInstance().feedPcmAudio(copy, System.nanoTime() / 1000L, mSampleRate, mChannelCount);
            } catch (Throwable t) {
                Log.w(TAG, "Error intercepting audio buffer", t);
            }
        }
        return mDelegate.write(audioData, sizeInBytes, writeMode);
    }

    @Override
    public int write(@NonNull byte[] audioData, int offsetInBytes, int sizeInBytes) {
        if (GameRecorder.getInstance().isRecording() && sizeInBytes > 0) {
            try {
                ByteBuffer wrap = ByteBuffer.wrap(audioData, offsetInBytes, sizeInBytes);
                GameRecorder.getInstance().feedPcmAudio(wrap, System.nanoTime() / 1000L, mSampleRate, mChannelCount);
            } catch (Throwable t) {
                Log.w(TAG, "Error intercepting audio byte array", t);
            }
        }
        return mDelegate.write(audioData, offsetInBytes, sizeInBytes);
    }

    @Override
    public int write(@NonNull byte[] audioData, int offsetInBytes, int sizeInBytes, int writeMode) {
        if (GameRecorder.getInstance().isRecording() && sizeInBytes > 0) {
            try {
                ByteBuffer wrap = ByteBuffer.wrap(audioData, offsetInBytes, sizeInBytes);
                GameRecorder.getInstance().feedPcmAudio(wrap, System.nanoTime() / 1000L, mSampleRate, mChannelCount);
            } catch (Throwable t) {
                Log.w(TAG, "Error intercepting audio byte array", t);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return mDelegate.write(audioData, offsetInBytes, sizeInBytes, writeMode);
        }
        return mDelegate.write(audioData, offsetInBytes, sizeInBytes);
    }

    @Override
    public int write(@NonNull short[] audioData, int offsetInShorts, int sizeInShorts) {
        return mDelegate.write(audioData, offsetInShorts, sizeInShorts);
    }

    @Override
    public void play() {
        mDelegate.play();
    }

    @Override
    public void stop() {
        mDelegate.stop();
    }

    @Override
    public void pause() {
        mDelegate.pause();
    }

    @Override
    public void flush() {
        mDelegate.flush();
    }

    @Override
    public void release() {
        mDelegate.release();
        try {
            super.release();
        } catch (Throwable ignored) {
        }
    }

    @Override
    public int getState() {
        return mDelegate.getState();
    }

    @Override
    public int getPlayState() {
        return mDelegate.getPlayState();
    }

    @Override
    public int getBufferSizeInFrames() {
        return mDelegate.getBufferSizeInFrames();
    }

    @Override
    public int getBufferCapacityInFrames() {
        return mDelegate.getBufferCapacityInFrames();
    }

    @Override
    public int getUnderrunCount() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return mDelegate.getUnderrunCount();
        }
        return 0;
    }

    @Override
    public int setBufferSizeInFrames(int bufferSizeInFrames) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return mDelegate.setBufferSizeInFrames(bufferSizeInFrames);
        }
        return 0;
    }

    @Override
    public int getPlaybackRate() {
        return mDelegate.getPlaybackRate();
    }

    @Override
    public int setPlaybackRate(int hz) {
        return mDelegate.setPlaybackRate(hz);
    }

    @Override
    public int getSampleRate() {
        return mDelegate.getSampleRate();
    }

    @Override
    public int getChannelCount() {
        return mDelegate.getChannelCount();
    }

    @Override
    public int getChannelConfiguration() {
        return mDelegate.getChannelConfiguration();
    }

    @Override
    public int getAudioFormat() {
        return mDelegate.getAudioFormat();
    }

    @Override
    public AudioFormat getFormat() {
        return mDelegate.getFormat();
    }

    @Override
    public AudioAttributes getAudioAttributes() {
        return mDelegate.getAudioAttributes();
    }

    @Override
    public int setVolume(float gain) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            return mDelegate.setVolume(gain);
        }
        return 0;
    }

    @Override
    public int setStereoVolume(float leftGain, float rightGain) {
        return mDelegate.setStereoVolume(leftGain, rightGain);
    }

    @Override
    public int getPlaybackHeadPosition() {
        return mDelegate.getPlaybackHeadPosition();
    }
}
