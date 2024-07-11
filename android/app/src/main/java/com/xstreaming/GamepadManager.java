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

    private void rumbleSingleVibrator(Vibrator vibrator, short lowFreqMotor, short highFreqMotor) {
        Log.d("GamepadManager", "rumbleSingleVibrator");

        int simulatedAmplitude = Math.min(255, (int)((lowFreqMotor * 0.80) + (highFreqMotor * 0.33)));

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
                VibrationEffect effect = VibrationEffect.createOneShot(60000, simulatedAmplitude);
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
            vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, onTime, offTime}, 0), vibrationAttributes);
        }
        else {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .build();
            vibrator.vibrate(new long[]{0, onTime, offTime}, 0, audioAttributes);
        }
    }

    @TargetApi(31)
    private boolean hasQuadAmplitudeControlledRumbleVibrators(VibratorManager vm) {
        int[] vibratorIds = vm.getVibratorIds();

        // There must be exactly 4 vibrators on this device
        if (vibratorIds.length != 4) {
            return false;
        }

        // All vibrators must have amplitude control
        for (int vid : vibratorIds) {
            if (!vm.getVibrator(vid).hasAmplitudeControl()) {
                return false;
            }
        }

        return true;
    }

    @TargetApi(31)
    private boolean hasDualAmplitudeControlledRumbleVibrators(VibratorManager vm) {
        int[] vibratorIds = vm.getVibratorIds();

        // There must be exactly 2 vibrators on this device
        if (vibratorIds.length != 2) {
            return false;
        }

        // Both vibrators must have amplitude control
        for (int vid : vibratorIds) {
            if (!vm.getVibrator(vid).hasAmplitudeControl()) {
                return false;
            }
        }

        return true;
    }

    @TargetApi(31)
    private void rumbleQuadVibrators(VibratorManager vm, int duration, short lowFreqMotor, short highFreqMotor, short leftTrigger, short rightTrigger) {
        Log.d("GamepadManager", "rumbleQuadVibrators");

        // If they're all zero, we can just call cancel().
        if (lowFreqMotor == 0 && highFreqMotor == 0 && leftTrigger == 0 && rightTrigger == 0) {
            vm.cancel();
            return;
        }

        // This is a guess based upon the behavior of FF_RUMBLE, but untested due to lack of Linux
        // support for trigger rumble!
        int[] vibratorIds = vm.getVibratorIds();
        int[] vibratorAmplitudes = new int[] { highFreqMotor, lowFreqMotor, leftTrigger, rightTrigger };

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

        vm.vibrate(combo.combine(), vibrationAttributes.build());
    }

    @TargetApi(31)
    private void rumbleDualVibrators(VibratorManager vm, int duration, short lowFreqMotor, short highFreqMotor) {
        Log.d("GamepadManager", "rumbleDualVibrators");
        // If they're both zero, we can just call cancel().
        if (lowFreqMotor == 0 && highFreqMotor == 0) {
            vm.cancel();
            return;
        }

        // There's no documentation that states that vibrators for FF_RUMBLE input devices will
        // always be enumerated in this order, but it seems consistent between Xbox Series X (USB),
        // PS3 (USB), and PS4 (USB+BT) controllers on Android 12 Beta 3.
        int[] vibratorIds = vm.getVibratorIds();
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

        vm.vibrate(combo.combine(), vibrationAttributes.build());
    }

    @ReactMethod
    public void vibrate(int duration, int lowFreqMotor, int highFreqMotor, int leftTrigger, int rightTrigger) {
        short _lowFreqMotor = (short) lowFreqMotor;
        short _highFreqMotor = (short) highFreqMotor;
        short _leftTrigger = (short) leftTrigger;
        short _rightTrigger = (short) rightTrigger;

        Vibrator deviceVibrator = (Vibrator) reactContext.getSystemService(Context.VIBRATOR_SERVICE);
        Vibrator vibrator = null;
        VibratorManager deviceVibratorManager;
        VibratorManager vibratorManager = null;
        boolean quadVibrators = false;
        boolean isGamepad = false;

        // Try to use the InputDevice's associated vibrators first
        int[] ids = InputDevice.getDeviceIds();
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && hasQuadAmplitudeControlledRumbleVibrators(dev.getVibratorManager())) {
                vibratorManager = dev.getVibratorManager();
                quadVibrators = true;
            }
            else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && hasDualAmplitudeControlledRumbleVibrators(dev.getVibratorManager())) {
                vibratorManager = dev.getVibratorManager();
            }
            else if (dev.getVibrator().hasVibrator()) {
                vibrator = dev.getVibrator();
            }

            Log.d("GamepadManager", "vibrator:" + vibrator);

            // Prefer the documented Android 12 rumble API which can handle dual vibrators on PS/Xbox controllers
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && vibratorManager != null) {
                Log.d("GamepadManager", "quadVibrators:" + quadVibrators);

                if (quadVibrators) {
                    rumbleQuadVibrators(vibratorManager, duration, _lowFreqMotor, _highFreqMotor, _leftTrigger, _rightTrigger);
                } else {
                    rumbleDualVibrators(vibratorManager, duration, _lowFreqMotor, _highFreqMotor);
                }
            }
            // If all else fails, we have to try the old Vibrator API
            else if (vibrator != null) {
                Log.d("GamepadManager", "rumbleSingleVibrator123:");
                rumbleSingleVibrator(vibrator, _lowFreqMotor, _highFreqMotor);
            }
            // Force device rumble
            else {
                rumbleSingleVibrator(deviceVibrator, _lowFreqMotor, _highFreqMotor);
            }
        }
    }
}
