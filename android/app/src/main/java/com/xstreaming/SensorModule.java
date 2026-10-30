package com.xstreaming;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.content.Context;
import android.view.Surface;
import android.view.WindowManager;
import android.os.SystemClock;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import android.util.Log;

public class SensorModule extends ReactContextBaseJavaModule implements SensorEventListener {

    private final ReactApplicationContext reactContext;
    private final SensorManager sensorManager;
    private final Sensor gyroscope;
    private int customSensitivityX = 15000;
    private int customSensitivityY = 15000;

    private static final float GYRO_DEADZONE = 0.025f;
    private static final float SMOOTHING_ALPHA = 0.40f;
    private float filteredX = 0f;
    private float filteredY = 0f;

    private long lastEmitTimestamp = 0;
    private static final long MIN_EMIT_INTERVAL_MS = 10;
    private boolean lastWasZero = true;

    public SensorModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.sensorManager = (SensorManager) reactContext.getSystemService(Context.SENSOR_SERVICE);
        this.gyroscope = sensorManager != null ? sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) : null;
    }

    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "SensorModule";
    }

    private int getDisplayRotation() {
        try {
            WindowManager wm = (WindowManager) reactContext.getSystemService(Context.WINDOW_SERVICE);
            if (wm != null && wm.getDefaultDisplay() != null) {
                return wm.getDefaultDisplay().getRotation();
            }
        } catch (Exception e) {
            Log.e("SensorModule", "Error getting display rotation", e);
        }
        return Surface.ROTATION_0;
    }

    @ReactMethod
    public void startSensor(int sensitivity_x, int sensitivity_y) {
        Log.d("SensorModule", "startSensor");
        this.customSensitivityX = sensitivity_x;
        this.customSensitivityY = sensitivity_y;
        this.filteredX = 0f;
        this.filteredY = 0f;
        this.lastEmitTimestamp = 0;
        this.lastWasZero = true;

        if (gyroscope != null && sensorManager != null) {
            sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_FASTEST);
        }
    }

    @ReactMethod
    public void stopSensor() {
        Log.d("SensorModule", "stopSensor");
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
            float rawX = event.values[0];
            float rawY = event.values[1];
            float rawZ = event.values[2];

            int rotation = getDisplayRotation();
            float pitch;
            float yawRoll;

            switch (rotation) {
                case Surface.ROTATION_90:
                    pitch = -rawY;
                    yawRoll = -rawX - (rawZ * 0.70f);
                    break;
                case Surface.ROTATION_270:
                    pitch = rawY;
                    yawRoll = rawX - (rawZ * 0.70f);
                    break;
                case Surface.ROTATION_180:
                    pitch = rawX;
                    yawRoll = rawY - (rawZ * 0.70f);
                    break;
                case Surface.ROTATION_0:
                default:
                    pitch = -rawX;
                    yawRoll = -rawY - (rawZ * 0.70f);
                    break;
            }

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