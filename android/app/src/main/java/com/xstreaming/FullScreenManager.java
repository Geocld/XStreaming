package com.xstreaming;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.hardware.Sensor;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Vibrator;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.os.Build;
import android.view.WindowManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import android.webkit.WebView;

import java.util.ArrayList;
import java.util.List;

public class FullScreenManager extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;

    public FullScreenManager(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
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

    @ReactMethod(isBlockingSynchronousMethod=true)
    public String getWebViewVersion() {
        String version = "";
        try {
            PackageInfo infos = WebView.getCurrentWebViewPackage();
            if (infos != null) {
                version = infos.versionName;
            }
            return version;
        } catch (Exception e) {
            return "";
        }
    }

    private static InputDevice.MotionRange getMotionRangeForJoystickAxis(InputDevice dev, int axis) {
        InputDevice.MotionRange range;

        // First get the axis for SOURCE_JOYSTICK
        range = dev.getMotionRange(axis, InputDevice.SOURCE_JOYSTICK);
        if (range == null) {
            // Now try the axis for SOURCE_GAMEPAD
            range = dev.getMotionRange(axis, InputDevice.SOURCE_GAMEPAD);
        }

        return range;
    }

    @ReactMethod(isBlockingSynchronousMethod=true)
    public WritableMap getDeviceInfos() {
        WritableMap params = Arguments.createMap();

        String androidVer = android.os.Build.VERSION.RELEASE;
        int apiVer = Build.VERSION.SDK_INT;
        String kernalVer = System.getProperty("os.version");
        String factor = Build.MANUFACTURER;
        String model = Build.MODEL;
        if (model != null) {
            model = model.trim().replaceAll("\\s*", "");
        } else {
            model = "";
        }

        String webviewVer = getWebViewVersion();

        Vibrator deviceVibrator = (Vibrator) reactContext.getSystemService(Context.VIBRATOR_SERVICE);
        boolean devVibrator = deviceVibrator.hasVibrator();

        List<InputDevice> ids = new ArrayList<>();
        int[] deviceIds = InputDevice.getDeviceIds();
        WritableArray devArr = Arguments.createArray();

        for (int deviceId : deviceIds) {
            InputDevice dev = InputDevice.getDevice(deviceId);
            int sources = dev.getSources();
            if (((sources & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD)
                    || ((sources & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK)) {
                if (getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_X) != null &&
                        getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_Y) != null) {
                    WritableMap obj = Arguments.createMap();

                    obj.putString("name", dev.getName());

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        String sensor = "";
                        if (dev.getSensorManager().getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null) {
                            sensor = " + Accelerator";
                        }
                        if(dev.getSensorManager().getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null) {
                            sensor = " + Gyroscope";
                        }
                        obj.putString("sensor", sensor);
                    } else {
                        obj.putString("sensor", "lowThanAndroid12");
                    }

                    String vid = dev.getVendorId()+"_"+dev.getProductId()
                            +"\t    ["+String.format("%04x", dev.getVendorId())+"_"+String.format("%04x", dev.getProductId())+"]";
                    obj.putString("VID_PID", vid);

                    obj.putBoolean("rumble", dev.getVibrator().hasVibrator());

                    obj.putString("details", dev.toString());

                    devArr.pushMap(obj);
                }
            }
        }

        params.putString("androidVer", androidVer);
        params.putInt("apiVer", apiVer);
        params.putString("kernelVer", kernalVer);
        params.putString("factor", factor);
        params.putString("model", model);
        params.putString("webviewVer", webviewVer);
        params.putBoolean("devVibrator", devVibrator);
        params.putArray("devs", devArr);

        return params;
    }
}
