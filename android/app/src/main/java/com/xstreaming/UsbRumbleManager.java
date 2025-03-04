package com.xstreaming;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableArray;
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

    @ReactMethod
    private void setDsController(int led_r, int led_g, int led_b, int mute, int player_led, int player_light, int rumble_heavy, int rumble_soft, int left_trigger_type, ReadableArray left_trigger_data, int right_trigger_type, ReadableArray right_trigger_data) {
        MainActivity mainActivity = (MainActivity) getCurrentActivity();
        if (mainActivity != null) {

            int left_size = left_trigger_data.size();
            int[] left_data = new int[10];
            for (int i = 0; i < left_size; i++) {
                left_data[i] = left_trigger_data.getInt(i);
            }

            int right_size = right_trigger_data.size();
            int[] right_data = new int[10];
            for (int i = 0; i < right_size; i++) {
                right_data[i] = right_trigger_data.getInt(i);
            }

            byte[] reportData = new byte[] {
                    0x02, // Report ID
                    (byte)0xff, // valid_flag0
                    (byte)0xf7, // valid_flag1
                    (byte)rumble_soft, // right motor rumble
                    (byte)rumble_heavy, // left motor rumble
                    0x00, 0x00, 0x00, 0x00,
                    (byte)mute,  // mute_button_led (0: mute LED off  | 1: mute LED on)
                    mute == 1 ? (byte)0x00 : (byte)0x10, // power_save_control(mute led on  = 0x00, off = 0x10)
                    (byte) right_trigger_type,          // R2 trigger effect mode
                    (byte) right_data[0], // R2 trigger effect parameter 1
                    (byte) right_data[1], // R2 trigger effect parameter 2
                    (byte) right_data[2], // R2 trigger effect parameter 3
                    (byte) right_data[3],       // R2 trigger effect parameter 4
                    (byte) right_data[4],       // R2 trigger effect parameter 5
                    (byte) right_data[5],       // R2 trigger effect parameter 6
                    (byte) right_data[6],       // R2 trigger effect parameter 7
                    0x00, 0x00, 0x00,
                    (byte) left_trigger_type,       // L2 trigger effect mode
                    (byte) left_data[0],       // L2 trigger effect parameter 1
                    (byte) left_data[1], // L2 trigger effect parameter 2
                    (byte) left_data[2],       // L2 trigger effect parameter 3
                    (byte) left_data[3],       // L2 trigger effect parameter 4
                    (byte) left_data[4],       // L2 trigger effect parameter 5
                    (byte) left_data[5],       // L2 trigger effect parameter 6
                    (byte) left_data[6],       // L2 trigger effect parameter 7
                    0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x03,
                    0x02,
                    0x00,
                    0x02,
                    (byte)player_light,     // player light brightness
                    (byte)player_led,       // player leds
                    (byte)led_r, (byte)led_g, (byte)led_b // RGB values
            };
            mainActivity.handleSendCommand(reportData);
        }
    }
}