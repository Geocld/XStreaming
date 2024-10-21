package com.xstreaming;

import android.app.Activity;
import android.net.wifi.WifiManager;
import android.util.Log;
import android.view.View;
import android.os.Build;
import android.content.Context;
import android.view.WindowManager;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

public class WifiModeManager extends ReactContextBaseJavaModule {

    private WifiManager wifiManager;
    private WifiManager.WifiLock wifiLock;

    public WifiModeManager(ReactApplicationContext reactContext) {
        super(reactContext);
        wifiManager = (WifiManager) reactContext.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "WifiModeManager";
    }

    @ReactMethod
    private void setLowLatencyMode(boolean enabled) {
        if (wifiManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                if (enabled) {
                    if (wifiLock == null || !wifiLock.isHeld()) {
                        Log.d("WifiModeManager", "isetLowLatencyMode:" + enabled);
                        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "LowLatencyLock");
                        wifiLock.acquire();
                    }
                } else {
                    if (wifiLock != null && wifiLock.isHeld()) {
                        Log.d("WifiModeManager", "isetLowLatencyMode:" + enabled);
                        wifiLock.release();
                        wifiLock = null;
                    }
                }

            }
        }
    }
}
