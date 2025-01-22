package com.xstreaming;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import android.util.Log;

public class SensorModule extends ReactContextBaseJavaModule  implements SensorEventListener{

    private final ReactApplicationContext reactContext;
    private final SensorManager sensorManager;
    private final Sensor gyroscope;
    private static final float SENSITIVITY = 0.1f;

    static float lastX = 0, lastY = 0;

    public SensorModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.sensorManager = (SensorManager) reactContext.getSystemService(Context.SENSOR_SERVICE);
        this.gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
    }
    @Override
    public void initialize() {}

    @Override
    public String getName() {
        return "SensorModule";
    }

    @ReactMethod
    public void startSensor() {
        Log.d("SensorModule", "startSensor");
        if (gyroscope != null) {
            sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @ReactMethod
    public void stopSensor() {
        Log.d("SensorModule", "stopSensor");
        sensorManager.unregisterListener(this);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {

            float sensitivity = (1 << 8) * 12000 / 100f;

            float x = -event.values[0];
            float y = event.values[1];

            final float nowX = sensitivity * x + lastX;
            final float nowY = sensitivity * y + lastY;
            int roundX = Math.round(nowX);
            int roundY = Math.round(nowY);

            lastX = nowX - roundX;
            lastY = nowY - roundY;

            if (roundX > 32767) {
                roundX = 32767;
            } else if (roundX < -32767) {
                roundX = -32767;
            }

            if (roundY > 32767) {
                roundY = 32767;
            } else if (roundY < -32767) {
                roundY = -32767;
            }


            WritableMap params = Arguments.createMap();

            params.putDouble("x", roundX);
            params.putDouble("y", roundY);

            sendEvent("SensorData", params);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void sendEvent(String eventName, WritableMap params) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }
}