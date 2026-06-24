package com.xstreaming;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AudioSettingModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

    public AudioSettingModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "AudioSettingModule";
    }

    @ReactMethod
    public void setStereoEnabled(boolean enabled) {
        AudioConfig.setStereoEnabled(reactContext, enabled);
    }

    @ReactMethod
    public void setLowLatencyDecoderEnabled(boolean enabled) {
        LowLatencyDecoderConfig.setEnabled(reactContext, enabled);
    }
}
