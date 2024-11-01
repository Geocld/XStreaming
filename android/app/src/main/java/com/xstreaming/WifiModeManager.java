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
    private WifiManager.WifiLock highPerfWifiLock;
    private WifiManager.WifiLock lowLatencyWifiLock;

    public WifiModeManager(ReactApplicationContext reactContext) {
        super(reactContext);
//        wifiManager = (WifiManager) reactContext.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "WifiModeManager";
    }

    @ReactMethod
    private void setLowLatencyMode(boolean enabled) {
//        if (wifiManager != null) {
//            if (enabled) {
//                try {
//                    highPerfWifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "XStreaming High Perf Lock");
//                    highPerfWifiLock.setReferenceCounted(false);
//                    highPerfWifiLock.acquire();
//
//                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
//                        lowLatencyWifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "XStreaming Low Latency Lock");
//                        lowLatencyWifiLock.setReferenceCounted(false);
//                        lowLatencyWifiLock.acquire();
//                    }
//                } catch (SecurityException e) {
//                    // Some Samsung Galaxy S10+/S10e devices throw a SecurityException from
//                    // WifiLock.acquire() even though we have android.permission.WAKE_LOCK in our manifest.
//                    e.printStackTrace();
//                }
//            } else {
//                if (highPerfWifiLock != null) {
//                    highPerfWifiLock.release();
//                }
//                if (lowLatencyWifiLock != null) {
//                    lowLatencyWifiLock.release();
//                }
//            }
//        }
    }
}
