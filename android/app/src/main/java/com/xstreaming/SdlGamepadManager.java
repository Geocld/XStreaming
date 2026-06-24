package com.xstreaming;

import android.util.Log;
import android.util.SparseBooleanArray;
import android.util.SparseIntArray;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyEvent;
import android.view.MotionEvent;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.List;

public class SdlGamepadManager extends ReactContextBaseJavaModule {
    private static final String TAG = "SdlGamepadManager";
    private static final Object LOCK = new Object();
    private static final SparseIntArray CONTROLLER_INDEX_BY_DEVICE_ID = new SparseIntArray();
    private static final SparseBooleanArray USED_CONTROLLER_INDICES = new SparseBooleanArray();
    private static final SparseIntArray LAST_HAT_X_BY_DEVICE_ID = new SparseIntArray();
    private static final SparseIntArray LAST_HAT_Y_BY_DEVICE_ID = new SparseIntArray();
    private static ReactApplicationContext reactContext;
    private static boolean active = false;
    private static boolean sdlLibraryLoaded = false;

    public SdlGamepadManager(ReactApplicationContext context) {
        super(context);
        reactContext = context;
    }

    @Override
    public String getName() {
        return "SdlGamepadManager";
    }

    @ReactMethod
    public void startController(double deadZone, int edgeCompensation, boolean shortTrigger, boolean swapDpad, Promise promise) {
        ensureSdlLibraryLoaded();
        synchronized (LOCK) {
            active = true;
            pollInputDevicesLocked();
        }
        promise.resolve(true);
    }

    @ReactMethod
    public void stopController() {
        synchronized (LOCK) {
            active = false;
            CONTROLLER_INDEX_BY_DEVICE_ID.clear();
            USED_CONTROLLER_INDICES.clear();
            LAST_HAT_X_BY_DEVICE_ID.clear();
            LAST_HAT_Y_BY_DEVICE_ID.clear();
        }
    }

    @ReactMethod
    public void pollInputDevices(Promise promise) {
        synchronized (LOCK) {
            promise.resolve(pollInputDevicesLocked());
        }
    }

    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(double count) {}

    public static boolean isActive() {
        synchronized (LOCK) {
            return active;
        }
    }

    public static boolean handleKeyEvent(KeyEvent event) {
        if (!isActive() || !isControllerKeyEvent(event)) {
            return false;
        }
        if (event.getAction() != KeyEvent.ACTION_DOWN && event.getAction() != KeyEvent.ACTION_UP) {
            return true;
        }

        int keyCode = remapKnownControllerKey(event);
        WritableMap params = Arguments.createMap();
        params.putString("kernel", "SDL");
        params.putInt("keyCode", keyCode);
        putControllerInfo(params, event);
        sendEvent(event.getAction() == KeyEvent.ACTION_DOWN ? "onGamepadKeyDown" : "onGamepadKeyUp", params);

        if (isDpadKey(keyCode)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                emitDpadDown(event, keyCode);
            } else {
                emitDpadUp(event);
            }
        }
        return true;
    }

    public static boolean handleMotionEvent(MotionEvent event) {
        if (!isActive() || !isControllerMotionEvent(event)) {
            return false;
        }
        if (event.getAction() != MotionEvent.ACTION_MOVE) {
            return true;
        }

        emitHatIfChanged(event);
        emitTrigger(event);
        emitStick(event);
        return true;
    }

    private static void ensureSdlLibraryLoaded() {
        if (sdlLibraryLoaded) {
            return;
        }
        try {
            System.loadLibrary("SDL2");
            sdlLibraryLoaded = true;
            Log.i(TAG, "SDL2 library loaded");
        } catch (Throwable e) {
            Log.w(TAG, "SDL2 library unavailable, using Android event bridge fallback", e);
        }
    }

    private static int pollInputDevicesLocked() {
        int connected = 0;
        int[] ids = InputDevice.getDeviceIds();
        for (int id : ids) {
            InputDevice device = InputDevice.getDevice(id);
            if (!isGameControllerDevice(device)) {
                continue;
            }
            connected++;
            getOrAssignControllerIndexLocked(id);
        }
        return connected;
    }

    private static boolean isControllerKeyEvent(KeyEvent event) {
        int source = event.getSource();
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
                (source & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    private static boolean isControllerMotionEvent(MotionEvent event) {
        int source = event.getSource();
        return (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
                (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (source & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    private static boolean isGameControllerDevice(@Nullable InputDevice device) {
        if (device == null) {
            return false;
        }
        int sources = device.getSources();
        return (sources & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (sources & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
                (sources & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    private static int getOrAssignControllerIndexLocked(int deviceId) {
        if (deviceId < 0) {
            return -1;
        }
        int existing = CONTROLLER_INDEX_BY_DEVICE_ID.get(deviceId, -1);
        if (existing >= 0) {
            return existing;
        }

        int index = 0;
        while (USED_CONTROLLER_INDICES.get(index, false)) {
            index++;
        }
        USED_CONTROLLER_INDICES.put(index, true);
        CONTROLLER_INDEX_BY_DEVICE_ID.put(deviceId, index);
        return index;
    }

    private static void putControllerInfo(WritableMap params, InputEvent event) {
        int deviceId = event != null ? event.getDeviceId() : -1;
        InputDevice device = event != null ? event.getDevice() : null;
        params.putInt("deviceId", deviceId);
        params.putInt("gamepadIndex", isGameControllerDevice(device) ? getOrAssignControllerIndex(deviceId) : -1);
    }

    private static int getOrAssignControllerIndex(int deviceId) {
        synchronized (LOCK) {
            return getOrAssignControllerIndexLocked(deviceId);
        }
    }

    private static InputDevice.MotionRange getMotionRange(InputDevice device, int axis) {
        InputDevice.MotionRange range = device.getMotionRange(axis, InputDevice.SOURCE_JOYSTICK);
        if (range == null) {
            range = device.getMotionRange(axis, InputDevice.SOURCE_GAMEPAD);
        }
        return range;
    }

    private static float axis(MotionEvent event, int axis) {
        return clamp(event.getAxisValue(axis), -1f, 1f);
    }

    private static float axisWithFallback(MotionEvent event, int first, int second) {
        float value = event.getAxisValue(first);
        if (Math.abs(value) < 0.001f) {
            value = event.getAxisValue(second);
        }
        return clamp(value, -1f, 1f);
    }

    private static float trigger(MotionEvent event, int first, int second) {
        float value = event.getAxisValue(first);
        if (value <= 0.001f) {
            value = event.getAxisValue(second);
        }
        return clamp(value, 0f, 1f);
    }

    private static void emitTrigger(MotionEvent event) {
        WritableMap params = Arguments.createMap();
        params.putString("kernel", "SDL");
        params.putDouble("leftTrigger", trigger(event, MotionEvent.AXIS_LTRIGGER, MotionEvent.AXIS_BRAKE));
        params.putDouble("rightTrigger", trigger(event, MotionEvent.AXIS_RTRIGGER, MotionEvent.AXIS_GAS));
        putControllerInfo(params, event);
        sendEvent("onTrigger", params);
    }

    private static void emitStick(MotionEvent event) {
        InputDevice device = event.getDevice();
        int rightStickXAxis = MotionEvent.AXIS_Z;
        int rightStickYAxis = MotionEvent.AXIS_RZ;
        if (device != null && (getMotionRange(device, MotionEvent.AXIS_Z) == null ||
                getMotionRange(device, MotionEvent.AXIS_RZ) == null)) {
            rightStickXAxis = MotionEvent.AXIS_RX;
            rightStickYAxis = MotionEvent.AXIS_RY;
        }

        WritableMap params = Arguments.createMap();
        params.putString("kernel", "SDL");
        params.putDouble("leftStickX", axis(event, MotionEvent.AXIS_X));
        params.putDouble("leftStickY", axis(event, MotionEvent.AXIS_Y));
        params.putDouble("rightStickX", axisWithFallback(event, rightStickXAxis, MotionEvent.AXIS_RX));
        params.putDouble("rightStickY", axisWithFallback(event, rightStickYAxis, MotionEvent.AXIS_RY));
        putControllerInfo(params, event);
        sendEvent("onStickMove", params);
    }

    private static void emitHatIfChanged(MotionEvent event) {
        int deviceId = event.getDeviceId();
        int hatX = Math.round(event.getAxisValue(MotionEvent.AXIS_HAT_X));
        int hatY = Math.round(event.getAxisValue(MotionEvent.AXIS_HAT_Y));
        int lastX = LAST_HAT_X_BY_DEVICE_ID.get(deviceId, Integer.MIN_VALUE);
        int lastY = LAST_HAT_Y_BY_DEVICE_ID.get(deviceId, Integer.MIN_VALUE);
        if (hatX == lastX && hatY == lastY) {
            return;
        }
        LAST_HAT_X_BY_DEVICE_ID.put(deviceId, hatX);
        LAST_HAT_Y_BY_DEVICE_ID.put(deviceId, hatY);

        List<Integer> pressed = new ArrayList<>();
        if (hatX < 0) {
            pressed.add(KeyEvent.KEYCODE_DPAD_LEFT);
        } else if (hatX > 0) {
            pressed.add(KeyEvent.KEYCODE_DPAD_RIGHT);
        }
        if (hatY < 0) {
            pressed.add(KeyEvent.KEYCODE_DPAD_UP);
        } else if (hatY > 0) {
            pressed.add(KeyEvent.KEYCODE_DPAD_DOWN);
        }

        if (pressed.isEmpty()) {
            emitDpadUp(event);
        } else {
            emitDpadDown(event, pressed);
        }
    }

    private static void emitDpadDown(InputEvent event, int keyCode) {
        List<Integer> pressed = new ArrayList<>();
        pressed.add(keyCode);
        emitDpadDown(event, pressed);
    }

    private static void emitDpadDown(InputEvent event, List<Integer> keyCodes) {
        WritableMap params = Arguments.createMap();
        WritableArray list = Arguments.createArray();
        for (Integer code : keyCodes) {
            list.pushInt(code);
        }
        params.putString("kernel", "SDL");
        params.putInt("dpadIdx", keyCodes.isEmpty() ? -1 : keyCodes.get(0));
        params.putArray("dpadIdxList", list);
        putControllerInfo(params, event);
        sendEvent("onDpadKeyDown", params);
    }

    private static void emitDpadUp(InputEvent event) {
        WritableMap params = Arguments.createMap();
        WritableArray list = Arguments.createArray();
        params.putString("kernel", "SDL");
        params.putInt("dpadIdx", -1);
        params.putArray("dpadIdxList", list);
        putControllerInfo(params, event);
        sendEvent("onDpadKeyUp", params);
    }

    private static boolean isDpadKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_DPAD_UP ||
                keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                keyCode == KeyEvent.KEYCODE_DPAD_RIGHT;
    }

    private static int remapKnownControllerKey(KeyEvent event) {
        InputDevice inputDevice = event.getDevice();
        if (inputDevice == null) {
            return event.getKeyCode();
        }

        if (inputDevice.getVendorId() == 0x057e && inputDevice.getProductId() == 0x2006) {
            switch (event.getScanCode()) {
                case 546:
                    return KeyEvent.KEYCODE_DPAD_LEFT;
                case 547:
                    return KeyEvent.KEYCODE_DPAD_RIGHT;
                case 544:
                    return KeyEvent.KEYCODE_DPAD_UP;
                case 545:
                    return KeyEvent.KEYCODE_DPAD_DOWN;
                case 309:
                    return KeyEvent.KEYCODE_BUTTON_MODE;
                case 310:
                    return KeyEvent.KEYCODE_BUTTON_L1;
                case 312:
                    return KeyEvent.KEYCODE_BUTTON_L2;
                case 314:
                    return KeyEvent.KEYCODE_BUTTON_SELECT;
                case 317:
                    return KeyEvent.KEYCODE_BUTTON_THUMBL;
                default:
                    return event.getKeyCode();
            }
        }

        if (inputDevice.getVendorId() == 0x057e && inputDevice.getProductId() == 0x2007) {
            switch (event.getScanCode()) {
                case 307:
                    return KeyEvent.KEYCODE_BUTTON_Y;
                case 308:
                    return KeyEvent.KEYCODE_BUTTON_X;
                case 304:
                    return KeyEvent.KEYCODE_BUTTON_A;
                case 305:
                    return KeyEvent.KEYCODE_BUTTON_B;
                case 311:
                    return KeyEvent.KEYCODE_BUTTON_R1;
                case 313:
                    return KeyEvent.KEYCODE_BUTTON_R2;
                case 315:
                    return KeyEvent.KEYCODE_BUTTON_START;
                case 316:
                    return KeyEvent.KEYCODE_BUTTON_MODE;
                case 318:
                    return KeyEvent.KEYCODE_BUTTON_THUMBR;
                default:
                    return event.getKeyCode();
            }
        }

        return event.getKeyCode();
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private static void sendEvent(String eventName, WritableMap params) {
        ReactApplicationContext context = reactContext;
        if (context == null || !context.hasActiveCatalystInstance()) {
            return;
        }
        context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }
}
