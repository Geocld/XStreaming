package com.xstreaming;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.view.View;
import android.os.Build;
import android.view.WindowManager;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

public class FullScreenManager extends ReactContextBaseJavaModule {
    public FullScreenManager(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "FullScreenManager";
    }

    @ReactMethod
    private void immersiveModeOn() {
        final Activity reactActivity = getCurrentActivity();

        final int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;

        if (reactActivity != null) {
            reactActivity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        WindowManager.LayoutParams layoutParams = reactActivity.getWindow().getAttributes();
                        layoutParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                        reactActivity.getWindow().setAttributes(layoutParams);
                    }
                    reactActivity.getWindow()
                            .getDecorView()
                            .setSystemUiVisibility(flags);
                }
            });
        }
    }
    @ReactMethod
    private void immersiveModeOff() {
        final Activity reactActivity = getCurrentActivity();
        final int flag = View.SYSTEM_UI_FLAG_VISIBLE;

        if (reactActivity != null) {
            reactActivity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    reactActivity.getWindow()
                            .getDecorView()
                            .setSystemUiVisibility(flag);
                }
            });
        }
    }

    @ReactMethod
    public void onFullScreen() {
        UiThreadUtil.runOnUiThread(
                new Runnable() {
                    @Override
                    public void run() {
                        getCurrentActivity().getWindow().getDecorView().setSystemUiVisibility(
                                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION // hide nav bar
                                        | View.SYSTEM_UI_FLAG_FULLSCREEN // hide status bar
                                        | View.SYSTEM_UI_FLAG_IMMERSIVE
                        );
                    }
                }
        );

    }



    @ReactMethod
    public void offFullScreen() {
        UiThreadUtil.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                getCurrentActivity().getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                );
            }
        });

    }
}
