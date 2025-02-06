package com.xstreaming;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
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
    private int customSensitivity = 15000;

    static float lastX = 0, lastY = 0;

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

        // First get the axis for SOURCE_JOYSTICK
        range = dev.getMotionRange(axis, InputDevice.SOURCE_JOYSTICK);
        if (range == null) {
            // Now try the axis for SOURCE_GAMEPAD
            range = dev.getMotionRange(axis, InputDevice.SOURCE_GAMEPAD);
        }

        return range;
    }

    @ReactMethod
    public void startSensor(int sensitivity) {
        Log.d("GamepadSensorModule", "startSensor");
        this.customSensitivity = sensitivity;

        if ((Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ||
                (Build.VERSION.SDK_INT == Build.VERSION_CODES.S))) {
            int[] deviceIds = InputDevice.getDeviceIds();

            for (int deviceId : deviceIds) {
                InputDevice dev = InputDevice.getDevice(deviceId);
                int sources = dev.getSources();
                if (((sources & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD)
                        || ((sources & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK)) {
                    if (getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_X) != null &&
                            getMotionRangeForJoystickAxis(dev, MotionEvent.AXIS_Y) != null) {
                        // This is gamepad
                        if (dev.getSensorManager().getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null) {
                            // Gamepad support sensor
                            Log.d("GamepadSensorModule", "Gamepad support sensor");
                            this.sensorManager = dev.getSensorManager();
                            this.gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);

                            sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_FASTEST);
                        }
                    }
                }
            }
        }
    }

    @ReactMethod
    public void stopSensor() {
        Log.d("GamepadSensorModule", "stopSensor");
        if(sensorManager != null) {
            sensorManager.unregisterListener(this);
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {

            float sensitivity = (1 << 8) * this.customSensitivity / 100f;

            float x = -event.values[1];
            float y = -event.values[0];

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
