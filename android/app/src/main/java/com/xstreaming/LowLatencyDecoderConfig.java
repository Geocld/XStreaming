package com.xstreaming;

import android.content.Context;
import android.content.SharedPreferences;

public final class LowLatencyDecoderConfig {
    private static final String PREF_NAME = "xstreaming_low_latency_decoder_config";
    private static final String KEY_ENABLED = "native_low_latency_decoder";

    private LowLatencyDecoderConfig() {}

    public static boolean isEnabled(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        return preferences.getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean enabled) {
        SharedPreferences preferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        preferences.edit().putBoolean(KEY_ENABLED, enabled).apply();
    }
}
