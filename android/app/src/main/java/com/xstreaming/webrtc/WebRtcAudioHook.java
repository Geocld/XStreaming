package com.xstreaming.webrtc;

import android.media.AudioTrack;
import android.util.Log;

import org.webrtc.audio.AudioDeviceModule;
import org.webrtc.audio.JavaAudioDeviceModule;

import java.lang.reflect.Field;

public class WebRtcAudioHook {
    private static final String TAG = "WebRtcAudioHook";

    public static void hookAudioTrack(AudioDeviceModule adm) {
        if (!(adm instanceof JavaAudioDeviceModule)) {
            return;
        }

        try {
            Field audioOutputField = JavaAudioDeviceModule.class.getDeclaredField("audioOutput");
            audioOutputField.setAccessible(true);
            Object audioOutput = audioOutputField.get(adm);
            if (audioOutput == null) {
                return;
            }

            Field audioTrackField = audioOutput.getClass().getDeclaredField("audioTrack");
            audioTrackField.setAccessible(true);
            AudioTrack currentTrack = (AudioTrack) audioTrackField.get(audioOutput);
            if (currentTrack != null && !(currentTrack instanceof DelegatingAudioTrack)) {
                DelegatingAudioTrack delegating = new DelegatingAudioTrack(currentTrack);
                audioTrackField.set(audioOutput, delegating);
                Log.i(TAG, "Hooked WebRTC AudioTrack with DelegatingAudioTrack");
            }
        } catch (Throwable e) {
            Log.e(TAG, "Failed to hook WebRTC AudioTrack", e);
        }
    }
}
