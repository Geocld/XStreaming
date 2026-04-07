package com.xstreaming;

import android.content.Context;
import android.content.SharedPreferences;

public final class AudioConfig {
    private static final String PREF_NAME = "xstreaming_audio_config";
    private static final String KEY_STEREO_ENABLED = "enable_stereo_audio";

    private AudioConfig() {}

    public static boolean isStereoEnabled(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        return preferences.getBoolean(KEY_STEREO_ENABLED, true);
    }

    public static void setStereoEnabled(Context context, boolean enabled) {
        SharedPreferences preferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        preferences.edit().putBoolean(KEY_STEREO_ENABLED, enabled).apply();
    }
}
