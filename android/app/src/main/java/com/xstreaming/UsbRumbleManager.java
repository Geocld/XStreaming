package com.xstreaming;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.util.Log;
import android.view.View;

public class UsbRumbleManager extends ReactContextBaseJavaModule {

    private static boolean bindUsbDevice = false;
    private static boolean hasValidUsbDevice = false;
    private static String usbController = "";

    public UsbRumbleManager(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "UsbRumbleManager";
    }

    @ReactMethod
    public void setBindUsbDevice(boolean value) {
        bindUsbDevice = value;
    }

    public static boolean getBindUsbDevice() {
        return bindUsbDevice;
    }

    public static void setHasValidUsbDevice(boolean value) {
        hasValidUsbDevice = value;
    }

    @ReactMethod
    public void getHasValidUsbDevice(Promise promise) {
        promise.resolve(hasValidUsbDevice);
    }

    public static void setUsbController(String value) {
        usbController = value;
    }

    @ReactMethod
    public void getUsbController(Promise promise) {
        promise.resolve(usbController);
    }


    @ReactMethod
    private void rumble(int lowFreqMotor, int highFreqMotor) {
        Log.d("UsbRumbleManager", "rumble");
        short _lowFreqMotor = (short) lowFreqMotor;
        short _highFreqMotor = (short) highFreqMotor;
        MainActivity mainActivity = (MainActivity) getCurrentActivity();
        if (mainActivity != null) {
            mainActivity.handleRumble(_lowFreqMotor, _highFreqMotor);
        }
    }

    @ReactMethod
    private void rumbleTriggers(int leftTrigger, int rightTrigger) {
        Log.d("UsbRumbleManager", "rumbleTrigger");
        short _leftTrigger = (short) leftTrigger;
        short _rightTrigger = (short) rightTrigger;
        MainActivity mainActivity = (MainActivity) getCurrentActivity();
        if (mainActivity != null) {
            mainActivity.handleRumbleTrigger(_leftTrigger, _rightTrigger);
        }
    }
}