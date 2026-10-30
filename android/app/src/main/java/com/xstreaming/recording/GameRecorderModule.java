package com.xstreaming.recording;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class GameRecorderModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "GameRecorderModule";
    private final ReactApplicationContext mReactContext;

    public GameRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        mReactContext = reactContext;
        GameRecorder.getInstance().init(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void startRecording(int width, int height, @Nullable String customPath, Promise promise) {
        GameRecorder.getInstance().startRecording(width, height, customPath, new GameRecorder.RecordCallback() {
            @Override
            public void onStarted(String filePath) {
                WritableMap params = Arguments.createMap();
                params.putString("filePath", filePath);
                sendEvent("onRecordingStarted", params);
                promise.resolve(filePath);
            }

            @Override
            public void onStopped(String filePath) {
                WritableMap params = Arguments.createMap();
                params.putString("filePath", filePath);
                sendEvent("onRecordingStopped", params);
            }

            @Override
            public void onError(String message) {
                WritableMap params = Arguments.createMap();
                params.putString("error", message);
                sendEvent("onRecordingError", params);
                promise.reject("RECORD_ERROR", message);
            }
        });
    }

    @ReactMethod
    public void stopRecording(Promise promise) {
        if (!GameRecorder.getInstance().isRecording()) {
            promise.reject("NOT_RECORDING", "No active recording");
            return;
        }

        GameRecorder.getInstance().stopRecording(new GameRecorder.RecordCallback() {
            @Override
            public void onStarted(String filePath) {
            }

            @Override
            public void onStopped(String filePath) {
                WritableMap params = Arguments.createMap();
                params.putString("filePath", filePath);
                sendEvent("onRecordingStopped", params);
                promise.resolve(filePath);
            }

            @Override
            public void onError(String message) {
                WritableMap params = Arguments.createMap();
                params.putString("error", message);
                sendEvent("onRecordingError", params);
                promise.reject("RECORD_ERROR", message);
            }
        });
    }

    @ReactMethod
    public void isRecording(Promise promise) {
        promise.resolve(GameRecorder.getInstance().isRecording());
    }

    @ReactMethod
    public void getCurrentFilePath(Promise promise) {
        promise.resolve(GameRecorder.getInstance().getCurrentFilePath());
    }

    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(double count) {
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        if (mReactContext.hasActiveReactInstance()) {
            mReactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
        }
    }
}
