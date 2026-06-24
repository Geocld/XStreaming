package com.xstreaming.gamepadtest;

import android.content.Context;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.widget.FrameLayout;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

public class GamepadTestView extends FrameLayout {
    private static final int BUTTON_CROSS = 1 << 0;
    private static final int BUTTON_MOON = 1 << 1;
    private static final int BUTTON_BOX = 1 << 2;
    private static final int BUTTON_PYRAMID = 1 << 3;
    private static final int BUTTON_DPAD_LEFT = 1 << 4;
    private static final int BUTTON_DPAD_RIGHT = 1 << 5;
    private static final int BUTTON_DPAD_UP = 1 << 6;
    private static final int BUTTON_DPAD_DOWN = 1 << 7;
    private static final int BUTTON_L1 = 1 << 8;
    private static final int BUTTON_R1 = 1 << 9;
    private static final int BUTTON_L3 = 1 << 10;
    private static final int BUTTON_R3 = 1 << 11;
    private static final int BUTTON_OPTIONS = 1 << 12;
    private static final int BUTTON_SHARE = 1 << 13;
    private static final int BUTTON_PS = 1 << 15;

    private static final String KERNEL_ANDROID = "android";
    private static final String KERNEL_SDL = "sdl";

    private final ThemedReactContext reactContext;
    private String kernel = KERNEL_ANDROID;
    private int buttons = 0;
    private float leftX = 0f;
    private float leftY = 0f;
    private float rightX = 0f;
    private float rightY = 0f;
    private float l2 = 0f;
    private float r2 = 0f;
    private float deadZone = 0.13f;
    private int edgeCompensation = 0;
    private boolean shortTrigger = false;

    public GamepadTestView(Context context) {
        super(context);
        reactContext = (ThemedReactContext) context;
        setFocusable(true);
        setFocusableInTouchMode(true);
    }

    public void setKernel(String value) {
        kernel = KERNEL_SDL.equals(value) ? KERNEL_SDL : KERNEL_ANDROID;
        resetState("reset");
        requestFocus();
    }

    public void setDeadZone(float value) {
        deadZone = Math.max(0f, Math.min(0.9f, value));
    }

    public void setEdgeCompensation(int value) {
        edgeCompensation = Math.max(0, Math.min(90, value));
    }

    public void setShortTrigger(boolean value) {
        shortTrigger = value;
    }

    public void setSwapDpad(boolean value) {}

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        requestFocus();
        emitState("attached");
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!isControllerKeyEvent(event)) {
            return super.dispatchKeyEvent(event);
        }
        if (event.getAction() != KeyEvent.ACTION_DOWN && event.getAction() != KeyEvent.ACTION_UP) {
            return true;
        }

        int mask = buttonMask(event.getKeyCode());
        if (mask == 0) {
            return true;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            buttons |= mask;
        } else {
            buttons &= ~mask;
        }
        emitState("active");
        return true;
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent event) {
        if (!isControllerMotionEvent(event)) {
            return super.onGenericMotionEvent(event);
        }

        leftX = axis(event, MotionEvent.AXIS_X);
        leftY = axis(event, MotionEvent.AXIS_Y);
        rightX = axisWithFallback(event, MotionEvent.AXIS_Z, MotionEvent.AXIS_RX);
        rightY = axisWithFallback(event, MotionEvent.AXIS_RZ, MotionEvent.AXIS_RY);
        l2 = trigger(event, MotionEvent.AXIS_LTRIGGER, MotionEvent.AXIS_BRAKE);
        r2 = trigger(event, MotionEvent.AXIS_RTRIGGER, MotionEvent.AXIS_GAS);
        updateHat(event);
        emitState("active");
        return true;
    }

    private void emitState(String status) {
        if (getId() == -1) {
            return;
        }
        WritableMap event = Arguments.createMap();
        event.putString("kernel", kernel);
        if (KERNEL_SDL.equals(kernel)) {
            event.putBoolean("sdlStarted", true);
            event.putString("snapshot", snapshotJson(status));
        } else {
            event.putString("status", status);
            event.putInt("buttons", buttons);
            event.putDouble("leftX", leftX);
            event.putDouble("leftY", leftY);
            event.putDouble("rightX", rightX);
            event.putDouble("rightY", rightY);
            event.putDouble("l2", l2);
            event.putDouble("r2", r2);
        }
        reactContext.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), "topState", event);
    }

    private String snapshotJson(String status) {
        return "{\"active\":true,\"status\":\"" + status + "\",\"name\":\"Android Controller\",\"buttons\":" +
                buttons + ",\"l2\":" + Math.round(l2 * 255f) + ",\"r2\":" + Math.round(r2 * 255f) +
                ",\"leftX\":" + signedAxis(leftX) + ",\"leftY\":" + signedAxis(leftY) +
                ",\"rightX\":" + signedAxis(rightX) + ",\"rightY\":" + signedAxis(rightY) + "}";
    }

    private void resetState(String status) {
        buttons = 0;
        leftX = 0f;
        leftY = 0f;
        rightX = 0f;
        rightY = 0f;
        l2 = 0f;
        r2 = 0f;
        emitState(status);
    }

    private boolean isControllerKeyEvent(KeyEvent event) {
        int source = event.getSource();
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
                (source & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    private boolean isControllerMotionEvent(MotionEvent event) {
        int source = event.getSource();
        return (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
                (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (source & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD;
    }

    private int buttonMask(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A:
                return BUTTON_CROSS;
            case KeyEvent.KEYCODE_BUTTON_B:
                return BUTTON_MOON;
            case KeyEvent.KEYCODE_BUTTON_X:
                return BUTTON_BOX;
            case KeyEvent.KEYCODE_BUTTON_Y:
                return BUTTON_PYRAMID;
            case KeyEvent.KEYCODE_DPAD_LEFT:
                return BUTTON_DPAD_LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                return BUTTON_DPAD_RIGHT;
            case KeyEvent.KEYCODE_DPAD_UP:
                return BUTTON_DPAD_UP;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return BUTTON_DPAD_DOWN;
            case KeyEvent.KEYCODE_BUTTON_L1:
                return BUTTON_L1;
            case KeyEvent.KEYCODE_BUTTON_R1:
                return BUTTON_R1;
            case KeyEvent.KEYCODE_BUTTON_THUMBL:
                return BUTTON_L3;
            case KeyEvent.KEYCODE_BUTTON_THUMBR:
                return BUTTON_R3;
            case KeyEvent.KEYCODE_BUTTON_START:
                return BUTTON_OPTIONS;
            case KeyEvent.KEYCODE_BUTTON_SELECT:
                return BUTTON_SHARE;
            case KeyEvent.KEYCODE_BUTTON_MODE:
                return BUTTON_PS;
            default:
                return 0;
        }
    }

    private float axis(MotionEvent event, int axis) {
        return applyDeadZone(event.getAxisValue(axis));
    }

    private float axisWithFallback(MotionEvent event, int first, int second) {
        float value = event.getAxisValue(first);
        if (Math.abs(value) < 0.001f) {
            value = event.getAxisValue(second);
        }
        return applyDeadZone(value);
    }

    private float trigger(MotionEvent event, int first, int second) {
        float value = event.getAxisValue(first);
        if (value <= 0.001f) {
            value = event.getAxisValue(second);
        }
        value = Math.max(0f, Math.min(1f, value));
        if (shortTrigger) {
            return value >= Math.max(0.05f, deadZone) ? 1f : 0f;
        }
        return value;
    }

    private float applyDeadZone(float value) {
        value = Math.max(-1f, Math.min(1f, value));
        if (Math.abs(value) < deadZone) {
            return 0f;
        }
        value = (value - Math.signum(value) * deadZone) / (1f - deadZone);
        float compensation = Math.max(0f, Math.min(0.9f, edgeCompensation / 100f));
        if (compensation > 0f && Math.abs(value) > 0.8f) {
            value = value > 0f ? Math.min(1f, value + compensation) : Math.max(-1f, value - compensation);
        }
        return Math.max(-1f, Math.min(1f, value));
    }

    private int signedAxis(float value) {
        return Math.round(Math.max(-1f, Math.min(1f, value)) * 32767f);
    }

    private void updateHat(MotionEvent event) {
        buttons &= ~(BUTTON_DPAD_LEFT | BUTTON_DPAD_RIGHT | BUTTON_DPAD_UP | BUTTON_DPAD_DOWN);
        float hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
        if (hatX < -0.5f) {
            buttons |= BUTTON_DPAD_LEFT;
        } else if (hatX > 0.5f) {
            buttons |= BUTTON_DPAD_RIGHT;
        }
        if (hatY < -0.5f) {
            buttons |= BUTTON_DPAD_UP;
        } else if (hatY > 0.5f) {
            buttons |= BUTTON_DPAD_DOWN;
        }
    }
}
