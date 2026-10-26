package com.xstreaming;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class GamepadSensorModule extends ReactContextBaseJavaModule implements SensorEventListener {
    private final ReactApplicationContext reactContext;
    private SensorManager sensorManager;
    private Sensor gyroscope;
    private int customSensitivityX = 15000;
    private int customSensitivityY = 15000;

    private static final float GYRO_DEADZONE = 0.025f;
    private static final float SMOOTHING_ALPHA = 0.40f;
    private float filteredX = 0f;
    private float filteredY = 0f;

    private long lastEmitTimestamp = 0;
    private static final long MIN_EMIT_INTERVAL_MS = 10;
    private boolean lastWasZero = true;

    public GamepadSensorModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "GamepadSensorModule";
    }

    private static InputDevice.MotionRange getMotionRangeForJoystickAxis(InputDevice dev, int axis) {
        InputDevice.MotionRange range;
        range = dev.getMotionRange(axis, InputDevice.SOURCE_JOYSTICK);
        if (range == null) {
            range = dev.getMotionRange(axis, InputDevice.SOURCE_GAMEPAD);
        }
        return range;
    }

    @ReactMethod
    public void startSensor(int sensitivity_x, int sensitivity_y) {
        Log.d("GamepadSensorModule", "startSensor");
        this.customSensitivityX = sensitivity_x;
        this.customSensitivityY = sensitivity_y;
        this.filteredX = 0f;
        this.filteredY = 0f;
        this.lastEmitTimestamp = 0;
        this.lastWasZero = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int[] deviceIds = InputDevice.getDeviceIds();

            for (int deviceId : deviceIds) {
                InputDevice dev = InputDevice.getDevice(deviceId);
                if (dev == null) continue;
                int sources = dev.getSources();
                if (((sources & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD)
                        || ((sources & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK)) {
                    if (getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_X) != null &&
                            getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_Y) != null) {
                        SensorManager devSensorManager = dev.getSensorManager();
                        if (devSensorManager != null && devSensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null) {
                            Log.d("GamepadSensorModule", "Gamepad support sensor found on deviceId: " + deviceId);
                            this.sensorManager = devSensorManager;
                            this.gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);

                            sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_FASTEST);
                            break;
                        }
                    }
                }
            }
        }
    }

    @ReactMethod
    public void stopSensor() {
        Log.d("GamepadSensorModule", "stopSensor");
        if (sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
        this.filteredX = 0f;
        this.filteredY = 0f;
        if (!lastWasZero) {
            WritableMap params = Arguments.createMap();
            params.putDouble("x", 0);
            params.putDouble("y", 0);
            sendEvent("SensorData", params);
            lastWasZero = true;
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {
            float pitch = event.values[0];
            float yawRoll = -event.values[2] - (event.values[1] * 0.70f);

            if (Math.abs(yawRoll) < GYRO_DEADZONE) {
                yawRoll = 0f;
            }
            if (Math.abs(pitch) < GYRO_DEADZONE) {
                pitch = 0f;
            }

            filteredX = (SMOOTHING_ALPHA * yawRoll) + ((1.0f - SMOOTHING_ALPHA) * filteredX);
            filteredY = (SMOOTHING_ALPHA * pitch) + ((1.0f - SMOOTHING_ALPHA) * filteredY);

            if (Math.abs(filteredX) < 0.001f) filteredX = 0f;
            if (Math.abs(filteredY) < 0.001f) filteredY = 0f;

            long now = SystemClock.elapsedRealtime();
            if (now - lastEmitTimestamp < MIN_EMIT_INTERVAL_MS) {
                return;
            }

            float scaleX = (this.customSensitivityX / 15000.0f) * 26000.0f;
            float scaleY = (this.customSensitivityY / 15000.0f) * 26000.0f;

            int roundX = Math.round(filteredX * scaleX);
            int roundY = Math.round(filteredY * scaleY);

            if (roundX > 32767) roundX = 32767;
            else if (roundX < -32767) roundX = -32767;

            if (roundY > 32767) roundY = 32767;
            else if (roundY < -32767) roundY = -32767;

            if (roundX == 0 && roundY == 0) {
                if (lastWasZero) {
                    return;
                }
                lastWasZero = true;
            } else {
                lastWasZero = false;
            }

            lastEmitTimestamp = now;

            WritableMap params = Arguments.createMap();
            params.putDouble("x", roundX);
            params.putDouble("y", roundY);

            sendEvent("SensorData", params);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void sendEvent(String eventName, WritableMap params) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
        }
    }
}
