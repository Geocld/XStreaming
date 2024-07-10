package com.xstreaming;

import android.hardware.input.InputManager;
import android.os.Build;
import android.util.Log;
import android.view.InputDevice;
import android.content.Context;
import android.os.Vibrator;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.os.CombinedVibration;
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
    public void vibrate(int duration, int lowFreqMotor, int highFreqMotor) {

        int[] ids = InputDevice.getDeviceIds();
//        Log.d("GamepadManager", "ids:" + ids);
        for (int id : ids) {
            InputDevice dev = InputDevice.getDevice(id);
            if (dev == null) {
                // This device was removed during enumeration
                continue;
            }
//            String devName = dev.getName();
//            Log.d("GamepadManager", "devName:" + devName);

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


                        // rumbleSingleVibrator: working in x-input mode
                        int simulatedAmplitude = Math.min(255, (int)((lowFreqMotor * 0.80) + (highFreqMotor * 0.33)));
                        Log.d("GamepadManager", "simulatedAmplitude:" + simulatedAmplitude);

                        if (simulatedAmplitude == 0) {
                            deviceVibratorManager.cancel();
                            return;
                        }

                        int[] vibratorAmplitudes = new int[] { highFreqMotor, lowFreqMotor };
                        CombinedVibration.ParallelCombination combo = CombinedVibration.startParallel();

                        for (int i = 0; i < vibratorIds.length; i++) {
                            // It's illegal to create a VibrationEffect with an amplitude of 0.
                            // Simply excluding that vibrator from our ParallelCombination will turn it off.
                            if (vibratorAmplitudes[i] != 0) {
                                combo.addVibrator(vibratorIds[i], VibrationEffect.createOneShot(duration, vibratorAmplitudes[i]));
                            }
                        }
                        VibrationAttributes.Builder vibrationAttributes = new VibrationAttributes.Builder();
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            vibrationAttributes.setUsage(VibrationAttributes.USAGE_MEDIA);
                        }
                        deviceVibratorManager.vibrate(combo.combine(), vibrationAttributes.build());


                        // Origin: android mode can vibrate, but x-input not working
//                        if (vibratorCount > 0) {
//                            updateVibrator(deviceVibratorManager.getVibrator(vibratorIds[0]), intensity, duration);
//
////                            if (vibratorCount > 1) {
////                                updateVibrator(deviceVibratorManager.getVibrator(vibratorIds[1]), 0, duration);
////                            }
//                        }


                    }
                }
            }
        }
    }
}
