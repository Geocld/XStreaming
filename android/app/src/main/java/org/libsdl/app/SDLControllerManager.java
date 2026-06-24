package org.libsdl.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class SDLControllerManager {
  private static final int[] AXES = new int[] {
      MotionEvent.AXIS_X,
      MotionEvent.AXIS_Y,
      MotionEvent.AXIS_Z,
      MotionEvent.AXIS_RX,
      MotionEvent.AXIS_RY,
      MotionEvent.AXIS_RZ,
      MotionEvent.AXIS_LTRIGGER,
      MotionEvent.AXIS_RTRIGGER,
      MotionEvent.AXIS_BRAKE,
      MotionEvent.AXIS_GAS
  };

  private static final Map<Integer, SDLJoystick> JOYSTICKS = new HashMap<>();
  private static final Map<Integer, SDLHaptic> HAPTICS = new HashMap<>();
  private static final int VIBRATOR_SERVICE_DEVICE_ID = 999999;
  private static boolean initialized = false;
  private static Context appContext = null;

  public static native int nativeSetupJNI();
  public static native int nativeAddJoystick(
      int deviceId,
      String name,
      String desc,
      int vendorId,
      int productId,
      boolean isAccelerometer,
      int buttonMask,
      int axes,
      int hats,
      int balls,
      int triggers);
  public static native int nativeRemoveJoystick(int deviceId);
  public static native int nativeAddHaptic(int deviceId, String name);
  public static native int nativeRemoveHaptic(int deviceId);
  public static native int onNativePadDown(int deviceId, int keyCode);
  public static native int onNativePadUp(int deviceId, int keyCode);
  public static native void onNativeJoy(int deviceId, int axis, float value);
  public static native void onNativeHat(int deviceId, int hatId, int x, int y);

  public static synchronized void initialize(Context context) {
    if (context != null) {
      appContext = context.getApplicationContext();
    }
    initialize();
  }

  public static synchronized void initialize() {
    if (initialized) {
      return;
    }
    nativeSetupJNI();
    initialized = true;
  }

  public static synchronized void pollInputDevices() {
    initialize();
    int[] ids = InputDevice.getDeviceIds();
    Set<Integer> currentIds = new HashSet<>();
    for (int id : ids) {
      InputDevice device = InputDevice.getDevice(id);
      if (!isGameController(device)) {
        continue;
      }
      currentIds.add(id);
      if (!JOYSTICKS.containsKey(id)) {
        addJoystick(device);
      }
    }

    ArrayList<Integer> removed = new ArrayList<>();
    for (Integer id : JOYSTICKS.keySet()) {
      if (!currentIds.contains(id)) {
        removed.add(id);
      }
    }
    for (Integer id : removed) {
      JOYSTICKS.remove(id);
      nativeRemoveJoystick(id);
    }
    pollHapticDevices();
  }

  public static synchronized void pollHapticDevices() {
    initialize();
    int[] ids = InputDevice.getDeviceIds();
    Set<Integer> currentIds = new HashSet<>();
    for (int id : ids) {
      InputDevice device = InputDevice.getDevice(id);
      if (device == null) {
        continue;
      }
      Vibrator vibrator = device.getVibrator();
      if (vibrator == null || !vibrator.hasVibrator()) {
        continue;
      }
      currentIds.add(id);
      if (!HAPTICS.containsKey(id)) {
        addHaptic(id, device.getName(), vibrator);
      }
    }

    boolean hasVibratorService = false;
    if (appContext != null) {
      Vibrator vibrator = (Vibrator) appContext.getSystemService(Context.VIBRATOR_SERVICE);
      hasVibratorService = vibrator != null && vibrator.hasVibrator();
      if (hasVibratorService && !HAPTICS.containsKey(VIBRATOR_SERVICE_DEVICE_ID)) {
        addHaptic(VIBRATOR_SERVICE_DEVICE_ID, "VIBRATOR_SERVICE", vibrator);
      }
    }

    ArrayList<Integer> removed = new ArrayList<>();
    for (Integer id : HAPTICS.keySet()) {
      if (id == VIBRATOR_SERVICE_DEVICE_ID) {
        if (!hasVibratorService) {
          removed.add(id);
        }
      } else if (!currentIds.contains(id)) {
        removed.add(id);
      }
    }
    for (Integer id : removed) {
      SDLHaptic haptic = HAPTICS.remove(id);
      if (haptic != null) {
        haptic.vibrator.cancel();
      }
      nativeRemoveHaptic(id);
    }
  }

  public static synchronized boolean hapticRunBest(int low, int high, int length) {
    pollHapticDevices();
    if (HAPTICS.isEmpty() || length <= 0) {
      return false;
    }
    int peak = Math.max(Math.max(low, high), 0);
    float intensity = Math.min(1f, peak / 65535f);
    if (intensity <= 0f) {
      for (Integer id : HAPTICS.keySet()) {
        hapticStop(id);
      }
      return true;
    }
    Integer bestDeviceId = null;
    for (Integer id : HAPTICS.keySet()) {
      if (id != VIBRATOR_SERVICE_DEVICE_ID) {
        bestDeviceId = id;
        break;
      }
    }
    if (bestDeviceId == null) {
      bestDeviceId = VIBRATOR_SERVICE_DEVICE_ID;
    }
    hapticRun(bestDeviceId, intensity, length);
    return true;
  }

  public static synchronized void hapticRun(int deviceId, float intensity, int length) {
    SDLHaptic haptic = HAPTICS.get(deviceId);
    if (haptic == null) {
      pollHapticDevices();
      haptic = HAPTICS.get(deviceId);
    }
    if (haptic == null || length <= 0) {
      return;
    }
    if (intensity <= 0f) {
      hapticStop(deviceId);
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      int amplitude = Math.max(1, Math.min(255, Math.round(intensity * 255f)));
      try {
        haptic.vibrator.vibrate(VibrationEffect.createOneShot(length, amplitude));
        return;
      } catch (Throwable ignored) {
      }
    }
    haptic.vibrator.vibrate(length);
  }

  public static synchronized void hapticStop(int deviceId) {
    SDLHaptic haptic = HAPTICS.get(deviceId);
    if (haptic != null) {
      haptic.vibrator.cancel();
    }
  }

  public static boolean handleKeyEvent(KeyEvent event) {
    if (event.getAction() == KeyEvent.ACTION_DOWN) {
      return onNativePadDown(event.getDeviceId(), event.getKeyCode()) == 0;
    }
    if (event.getAction() == KeyEvent.ACTION_UP) {
      return onNativePadUp(event.getDeviceId(), event.getKeyCode()) == 0;
    }
    return false;
  }

  public static boolean handleMotionEvent(MotionEvent event) {
    SDLJoystick joystick = JOYSTICKS.get(event.getDeviceId());
    if (joystick == null) {
      return false;
    }
    for (int i = 0; i < joystick.axes.size(); i++) {
      int axis = joystick.axes.get(i);
      onNativeJoy(joystick.deviceId, i, event.getAxisValue(axis));
    }
    for (int i = 0; i < joystick.hats.size() / 2; i++) {
      int x = Math.round(event.getAxisValue(joystick.hats.get(i * 2)));
      int y = Math.round(event.getAxisValue(joystick.hats.get(i * 2 + 1)));
      onNativeHat(joystick.deviceId, i, x, y);
    }
    return true;
  }

  private static void addJoystick(InputDevice device) {
    SDLJoystick joystick = new SDLJoystick(device.getId(), device.getName());
    for (int axis : AXES) {
      InputDevice.MotionRange range = getMotionRange(device, axis);
      if (range != null) {
        joystick.axes.add(axis);
      }
    }
    if (getMotionRange(device, MotionEvent.AXIS_HAT_X) != null &&
        getMotionRange(device, MotionEvent.AXIS_HAT_Y) != null) {
      joystick.hats.add(MotionEvent.AXIS_HAT_X);
      joystick.hats.add(MotionEvent.AXIS_HAT_Y);
    }

    JOYSTICKS.put(joystick.deviceId, joystick);
    nativeAddJoystick(
        joystick.deviceId,
        joystick.name,
        "",
        device.getVendorId(),
        device.getProductId(),
        false,
        0,
        joystick.axes.size(),
        joystick.hats.size() / 2,
        0,
        0);
  }

  private static void addHaptic(int deviceId, String name, Vibrator vibrator) {
    String hapticName = name == null ? "Android Haptic" : name;
    HAPTICS.put(deviceId, new SDLHaptic(deviceId, hapticName, vibrator));
    nativeAddHaptic(deviceId, hapticName);
  }

  private static boolean isGameController(InputDevice device) {
    if (device == null) {
      return false;
    }
    int sources = device.getSources();
    return (sources & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
        (sources & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
  }

  private static InputDevice.MotionRange getMotionRange(InputDevice device, int axis) {
    InputDevice.MotionRange range = device.getMotionRange(axis, InputDevice.SOURCE_JOYSTICK);
    if (range == null) {
      range = device.getMotionRange(axis, InputDevice.SOURCE_GAMEPAD);
    }
    return range;
  }

  private static class SDLJoystick {
    final int deviceId;
    final String name;
    final ArrayList<Integer> axes = new ArrayList<>();
    final ArrayList<Integer> hats = new ArrayList<>();

    SDLJoystick(int deviceId, String name) {
      this.deviceId = deviceId;
      this.name = name == null ? "Android Controller" : name;
    }
  }

  private static class SDLHaptic {
    final int deviceId;
    final String name;
    final Vibrator vibrator;

    SDLHaptic(int deviceId, String name, Vibrator vibrator) {
      this.deviceId = deviceId;
      this.name = name;
      this.vibrator = vibrator;
    }
  }
}
