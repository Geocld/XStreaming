package com.xstreaming;

import android.hardware.input.InputManager;
import android.os.Build;
import android.util.Log;
import android.view.InputDevice;
import android.content.Context;
import android.os.Vibrator;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import android.os.VibrationEffect;
import android.os.Vibrator;

public class GamepadManager extends ReactContextBaseJavaModule {

    private boolean hasGameController;

    private final ReactApplicationContext reactContext;
    public GamepadManager(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "GamepadManager";
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

    private void updateVibrator(Vibrator vibrator, int intensity, int duration) {
        if (vibrator != null) {
            if (intensity == 0 || duration == 0) {
                vibrator.cancel();
            } else if (duration > 0) {
                vibrator.vibrate(VibrationEffect.createOneShot(duration, intensity));
            }
        }
    }


    @ReactMethod
    public void vibrate(int duration, int intensity) {

        int[] ids = InputDevice.getDeviceIds();
        Log.d("GamepadManager", "ids:" + ids);
        for (int id : ids) {
            InputDevice dev = InputDevice.getDevice(id);
            if (dev == null) {
                // This device was removed during enumeration
                continue;
            }
            if ((dev.getSources() & InputDevice.SOURCE_JOYSTICK) != 0 ||
                    (dev.getSources() & InputDevice.SOURCE_GAMEPAD) != 0) {
                // This looks like a gamepad, but we'll check X and Y to be sure
                if (getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_X) != null &&
                        getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_Y) != null) {
                    // This is a gamepad
                    Log.d("GamepadManager", "hasGameController:" + hasGameController);
                    hasGameController = true;

                    InputDevice device = InputDevice.getDevice(id);
                    if (device == null) {
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        VibratorManager deviceVibratorManager = device.getVibratorManager();
                        int[] vibratorIds = deviceVibratorManager.getVibratorIds();
                        int vibratorCount = vibratorIds.length;
                        Log.d("GamepadManager", "vibratorCount:" + vibratorCount);

                        if (vibratorCount > 0) {
                            updateVibrator(deviceVibratorManager.getVibrator(vibratorIds[0]), intensity, duration);

//                            if (vibratorCount > 1) {
//                                updateVibrator(deviceVibratorManager.getVibrator(vibratorIds[1]), 0, duration);
//                            }
                        }
                    }
                }
            }
        }
    }
}
