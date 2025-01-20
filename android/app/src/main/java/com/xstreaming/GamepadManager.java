package com.xstreaming;

import android.annotation.TargetApi;
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
import android.media.AudioAttributes;

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

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GamepadManager extends ReactContextBaseJavaModule {

    private boolean hasGameController;

    private final ExecutorService executorService;

    private static String currentScreen = "";

    private final ReactApplicationContext reactContext;
    public GamepadManager(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.executorService = Executors.newSingleThreadExecutor();
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "GamepadManager";
    }

    private void rumbleSingleVibrator(Vibrator vibrator, int duration, short lowFreqMotor, short highFreqMotor, int intensity) {
        Log.d("GamepadManager", "rumbleSingleVibrator");


        int simulatedAmplitude = Math.min(255, (int)((lowFreqMotor) + (highFreqMotor)));

        if (intensity == 1) { // very weak
            simulatedAmplitude = Math.min(255, (int)((lowFreqMotor * 0.5) + (highFreqMotor * 0.4)));
        }
        if (intensity == 2) { // weak
            simulatedAmplitude = Math.min(255, (int)((lowFreqMotor * 0.9) + (highFreqMotor * 0.8)));
        }
        if (intensity == 4) { // strong
            simulatedAmplitude = Math.min(255, (int)((lowFreqMotor * 1.5) + (highFreqMotor * 2)));
        }
        if (intensity == 5) { // very strong
            simulatedAmplitude = Math.min(255, (int)((lowFreqMotor * 2) + (highFreqMotor * 2.5)));
        }

        Log.d("GamepadManager", "simulatedAmplitude:" + simulatedAmplitude);

        if (simulatedAmplitude == 0) {
            // This case is easy - just cancel the current effect and get out.
            // NB: We cannot simply check lowFreqMotor == highFreqMotor == 0
            // because our simulatedAmplitude could be 0 even though our inputs
            // are not (ex: lowFreqMotor == 0 && highFreqMotor == 1).
            vibrator.cancel();
            return;
        }

        // Attempt to use amplitude-based control if we're on Oreo and the device
        // supports amplitude-based vibration control.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (vibrator.hasAmplitudeControl()) {
                VibrationEffect effect = VibrationEffect.createOneShot(duration, simulatedAmplitude);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    VibrationAttributes vibrationAttributes = new VibrationAttributes.Builder()
                            .setUsage(VibrationAttributes.USAGE_MEDIA)
                            .build();
                    vibrator.vibrate(effect, vibrationAttributes);
                }
                else {
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .build();
                    vibrator.vibrate(effect, audioAttributes);
                }
                return;
            }
        }

        // If we reach this point, we don't have amplitude controls available, so
        // we must emulate it by PWMing the vibration. Ick.
        long pwmPeriod = 20;
        long onTime = (long)((simulatedAmplitude / 255.0) * pwmPeriod);
        long offTime = pwmPeriod - onTime;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            VibrationAttributes vibrationAttributes = new VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_MEDIA)
                    .build();
            vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, onTime * 100, offTime * 100}, 0), vibrationAttributes);
        }
        else {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .build();
            vibrator.vibrate(new long[]{0, onTime * 100, offTime * 100}, 0, audioAttributes);
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

    private static boolean hasJoystickAxes(InputDevice device) {
        return (device.getSources() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK &&
                getMotionRangeForJoystickAxis(device, MotionEvent.AXIS_X) != null &&
                getMotionRangeForJoystickAxis(device, MotionEvent.AXIS_Y) != null;
    }

    private static boolean hasGamepadButtons(InputDevice device) {
        return (device.getSources() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD;
    }

    private static boolean isGameControllerDevice(InputDevice device) {
        if (device == null) {
            return false;
        }
        if (hasJoystickAxes(device) || hasGamepadButtons(device)) {
            // Has real joystick axes or gamepad buttons
            return true;
        }
        // HACK for https://issuetracker.google.com/issues/163120692
        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.R) {
            if (device.getId() == -1) {
                // This "virtual" device could be input from any of the attached devices.
                // Look to see if any gamepads are connected.
                int[] ids = InputDevice.getDeviceIds();
                for (int id : ids) {
                    InputDevice dev = InputDevice.getDevice(id);
                    if (dev == null) {
                        // This device was removed during enumeration
                        continue;
                    }

                    // If there are any gamepad devices connected, we'll
                    // report that this virtual device is a gamepad.
                    if (hasJoystickAxes(dev) || hasGamepadButtons(dev)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    @ReactMethod
    public void setCurrentScreen(String value) {
        currentScreen = value;
    }

    public static String getCurrentScreen() {
        return currentScreen;
    }

    private int clampVibration(int value) {
        return Math.max(1, Math.min(255, value));
    }

    @ReactMethod
    public void vibrate(int duration, int lowFreqMotor, int highFreqMotor, int leftTrigger, int rightTrigger, int intensity) {
        short _lowFreqMotor = (short) lowFreqMotor;
        short _highFreqMotor = (short) highFreqMotor;
        short _leftTrigger = (short) leftTrigger;
        short _rightTrigger = (short) rightTrigger;

        Vibrator deviceVibrator = (Vibrator) reactContext.getSystemService(Context.VIBRATOR_SERVICE);
        Vibrator vibrator = null;

        // Try to use the InputDevice's associated vibrators first
        int[] ids = InputDevice.getDeviceIds();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vibratorManager = null;
            boolean quadVibrators = false;
            boolean isGamepad = false;
            boolean hasRealGamepad = false;

            for (int id : ids) {
                InputDevice dev = InputDevice.getDevice(id);
                if (dev == null) { continue; }

                if ((dev.getSources() & InputDevice.SOURCE_JOYSTICK) != 0 ||
                        (dev.getSources() & InputDevice.SOURCE_GAMEPAD) != 0) {
                    // This is a gamepad
                    isGamepad = true;
                }

                if (!isGamepad) {
                    continue;
                }

                // FIX: Check if is real game controller
                boolean isRealGamepad = isGameControllerDevice(dev);
                if (!isRealGamepad) {
                    continue;
                }
                hasRealGamepad = true;

                Log.d("GamepadManager", "isGameControllerDevice:" + dev.getName());

                boolean hasQuadAmplitudeControlledRumbleVibrators = true;
                boolean hasDualAmplitudeControlledRumbleVibrators = true;

                VibratorManager vm = dev.getVibratorManager();
                int[] vibratorIds = vm.getVibratorIds();

                // There must be exactly 4 vibrators on this device
                if (vibratorIds.length != 4) {
                    hasQuadAmplitudeControlledRumbleVibrators  = false;
                }
                if (vibratorIds.length != 2) {
                    hasDualAmplitudeControlledRumbleVibrators = false;
                }

                // All vibrators must have amplitude control
                for (int vid : vibratorIds) {
                    if (!vm.getVibrator(vid).hasAmplitudeControl()) {
                        hasQuadAmplitudeControlledRumbleVibrators = false;
                        hasDualAmplitudeControlledRumbleVibrators = false;
                    }
                }

                if (hasQuadAmplitudeControlledRumbleVibrators) {
                    vibratorManager = dev.getVibratorManager();
                    quadVibrators = true;
                } else if (hasDualAmplitudeControlledRumbleVibrators) {
                    vibratorManager = dev.getVibratorManager();
                } else if (dev.getVibrator().hasVibrator()) {
                    vibrator = dev.getVibrator();
                }

                Log.d("GamepadManager", "vibrator:" + vibrator);

                float intensityFactor = 1f;
                switch (intensity) {
                    case 1: // very weak
                        intensityFactor = 0.2f;
                        break;
                    case 2: // weak
                        intensityFactor = 0.5f;
                        break;
                    case 4: // strong
                        intensityFactor = 2f;
                        break;
                    case 5: // very strong
                        intensityFactor = 3f;
                        break;
                    default:
                        break;
                }

                // Prefer the documented Android 12 rumble API which can handle dual vibrators on PS/Xbox controllers
                if (vibratorManager != null) {

                    // rumbleQuadVibrators
                    if (quadVibrators) {
                        // If they're all zero, we can just call cancel().
                        if (_lowFreqMotor == 0 && _highFreqMotor == 0 && _leftTrigger == 0 && _rightTrigger == 0) {
                            vibratorManager.cancel();
                            return;
                        }

                        // This is a guess based upon the behavior of FF_RUMBLE, but untested due to lack of Linux
                        // support for trigger rumble!
                        int[] quadVibratorIds = vibratorManager.getVibratorIds();

                        int[] vibratorAmplitudes = new int[] {
                                clampVibration((int)(_highFreqMotor * intensityFactor)),
                                clampVibration((int)(_lowFreqMotor * intensityFactor)),
                                clampVibration((int)(_leftTrigger * intensityFactor)),
                                clampVibration((int)(_rightTrigger * intensityFactor))
                        };

                        boolean hasNonZeroAmplitude = false;
                        for (int amplitude : vibratorAmplitudes) {
                            if (amplitude != 0) {
                                hasNonZeroAmplitude = true;
                                break;
                            }
                        }

                        if (hasNonZeroAmplitude) {
                            CombinedVibration.ParallelCombination combo = CombinedVibration.startParallel();

                            for (int i = 0; i < quadVibratorIds.length; i++) {
                                // It's illegal to create a VibrationEffect with an amplitude of 0.
                                // Simply excluding that vibrator from our ParallelCombination will turn it off.
                                if (vibratorAmplitudes[i] != 0) {
                                    combo.addVibrator(quadVibratorIds[i], VibrationEffect.createOneShot(duration, vibratorAmplitudes[i]));
                                }
                            }

                            VibrationAttributes.Builder vibrationAttributes = new VibrationAttributes.Builder();

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                vibrationAttributes.setUsage(VibrationAttributes.USAGE_MEDIA);
                            }

                            vibratorManager.vibrate(combo.combine(), vibrationAttributes.build());
                        }
                    }
                    // rumbleDualVibrators
                    else {
                        // If they're both zero, we can just call cancel().
                        if (lowFreqMotor == 0 && highFreqMotor == 0) {
                            vibratorManager.cancel();
                            return;
                        }

                        // There's no documentation that states that vibrators for FF_RUMBLE input devices will
                        // always be enumerated in this order, but it seems consistent between Xbox Series X (USB),
                        // PS3 (USB), and PS4 (USB+BT) controllers on Android 12 Beta 3.
                        int[] qualVibratorIds = vibratorManager.getVibratorIds();
                        int[] vibratorAmplitudes = new int[] {
                                clampVibration((int)(_highFreqMotor * intensityFactor)),
                                clampVibration((int)(_lowFreqMotor * intensityFactor)),
                        };

                        boolean hasNonZeroAmplitude = false;
                        for (int amplitude : vibratorAmplitudes) {
                            if (amplitude != 0) {
                                hasNonZeroAmplitude = true;
                                break;
                            }
                        }

                        if (hasNonZeroAmplitude) {
                            CombinedVibration.ParallelCombination combo = CombinedVibration.startParallel();

                            for (int i = 0; i < qualVibratorIds.length; i++) {
                                // It's illegal to create a VibrationEffect with an amplitude of 0.
                                // Simply excluding that vibrator from our ParallelCombination will turn it off.
                                if (vibratorAmplitudes[i] != 0) {
                                    combo.addVibrator(qualVibratorIds[i], VibrationEffect.createOneShot(duration, vibratorAmplitudes[i]));
                                }
                            }

                            VibrationAttributes.Builder vibrationAttributes = new VibrationAttributes.Builder();

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                vibrationAttributes.setUsage(VibrationAttributes.USAGE_MEDIA);
                            }

                            Log.d("GamepadManager", "rumbleDualVibrators:" + vibrator);
                            vibratorManager.vibrate(combo.combine(), vibrationAttributes.build());
                        }
                    }
                }
                // If all else fails, we have to try the old Vibrator API
                else if (vibrator != null) {
                    Log.d("GamepadManager", "rumbleSingleVibrator:");
                    rumbleSingleVibrator(vibrator, duration, _lowFreqMotor, _highFreqMotor, intensity);
                }
                // Force device rumble
                else {
                    Log.d("GamepadManager", "Force device rumble");
                    rumbleSingleVibrator(deviceVibrator, duration, _lowFreqMotor, _highFreqMotor, intensity);
                }
            }

            if (!hasRealGamepad) {
                executorService.execute(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            rumbleSingleVibrator(deviceVibrator, duration, _lowFreqMotor, _highFreqMotor, intensity);
                        } catch (Exception e) {}
                    }
                });
            }

        } else {
            boolean isGamepad = false;
            Log.d("GamepadManager", "Old sdk entrying...");
            for (int id : ids) {
                InputDevice dev = InputDevice.getDevice(id);

                if (dev == null) { continue; }

                if ((dev.getSources() & InputDevice.SOURCE_JOYSTICK) != 0 ||
                        (dev.getSources() & InputDevice.SOURCE_GAMEPAD) != 0) {
                    // This is a gamepad
                    isGamepad = true;
                }

                if (!isGamepad) {
                    return;
                }

                if (dev.getVibrator().hasVibrator()) {
                    vibrator = dev.getVibrator();
                }

                Log.d("GamepadManager", "vibrator:" + vibrator);

                if (vibrator != null) {
                    Log.d("GamepadManager", "Old sdk rumbleSingleVibrator:");
                    if (Build.VERSION.SDK_INT == Build.VERSION_CODES.R) { // Android 11
                        rumbleSingleVibrator(deviceVibrator, duration, _lowFreqMotor, _highFreqMotor, intensity);
                    } else {
                        rumbleSingleVibrator(vibrator, duration, _lowFreqMotor, _highFreqMotor, intensity);
                    }

                    break;
                }
                // Force device rumble
                else {
                    Log.d("GamepadManager", "Old sdk device rumble:");
                    executorService.execute(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                rumbleSingleVibrator(deviceVibrator, duration, _lowFreqMotor, _highFreqMotor, intensity);
                            } catch (Exception e) {
                                Log.e("GamepadManager", "Error during vibration", e);
                            }
                        }
                    });
                }
            }
        }

    }
}
