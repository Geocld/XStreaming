package com.xstreaming;

import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;

public class BatteryModule extends ReactContextBaseJavaModule {

    ReactApplicationContext reactContext;

    public BatteryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "BatteryModule";
    }

    @ReactMethod
    public void getBatteryLevel(Promise promise) {
        try {
            IntentFilter iFilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = reactContext.registerReceiver(null, iFilter);

            int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);

            float batteryPct = level * 100 / (float)scale;
            promise.resolve(batteryPct);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
