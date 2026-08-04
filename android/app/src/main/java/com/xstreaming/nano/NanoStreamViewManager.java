package com.xstreaming.nano;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import android.util.Log;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class NanoStreamViewManager extends SimpleViewManager<NanoStreamView> {
    public static final String REACT_CLASS = "NanoStreamView";
    private static final String TAG = "NanoStreamViewManager";

    public static final int COMMAND_START_SESSION = 1;
    public static final int COMMAND_STOP_SESSION = 2;
    public static final int COMMAND_REQUEST_FOCUS = 3;
    public static final int COMMAND_SET_STATUS_TEXT = 4;
    public static final int COMMAND_SEND_GAMEPAD_STATE = 5;

    @Override
    @NonNull
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    @NonNull
    protected NanoStreamView createViewInstance(@NonNull ThemedReactContext reactContext) {
        Log.i(TAG, "createViewInstance");
        return new NanoStreamView(reactContext);
    }

    @ReactProp(name = "streamInfo")
    public void setStreamInfo(NanoStreamView view, @Nullable com.facebook.react.bridge.ReadableMap streamInfo) {
        view.setStreamInfo(streamInfo);
    }

    @ReactProp(name = "showStatus", defaultBoolean = true)
    public void setShowStatus(NanoStreamView view, boolean showStatus) {
        view.setShowStatus(showStatus);
    }

    @ReactProp(name = "statusText")
    public void setStatusText(NanoStreamView view, @Nullable String text) {
        view.setStatusText(text);
    }

    @ReactProp(name = "onNativeStateChange")
    public void setOnNativeStateChange(NanoStreamView view, @Nullable Boolean unused) {}

    @ReactProp(name = "onNanoRumble")
    public void setOnNanoRumble(NanoStreamView view, @Nullable Boolean unused) {}

    @Override
    public @Nullable Map<String, Integer> getCommandsMap() {
        return MapBuilder.<String, Integer>builder()
                .put("startSession", COMMAND_START_SESSION)
                .put("stopSession", COMMAND_STOP_SESSION)
                .put("requestFocus", COMMAND_REQUEST_FOCUS)
                .put("setStatusText", COMMAND_SET_STATUS_TEXT)
                .put("sendGamepadState", COMMAND_SEND_GAMEPAD_STATE)
                .build();
    }

    @Override
    public void receiveCommand(
            NanoStreamView view,
            String commandId,
            @Nullable ReadableArray args) {
        handleCommand(view, commandFromString(commandId), args);
    }

    @Override
    public void receiveCommand(
            @NonNull NanoStreamView view,
            int commandId,
            @Nullable ReadableArray args) {
        handleCommand(view, commandId, args);
    }

    private void handleCommand(
            NanoStreamView view,
            int command,
            @Nullable ReadableArray args) {
        // Log.i(TAG, "handleCommand command=" + command + " args=" + (args == null ? 0 : args.size()));
        switch (command) {
            case COMMAND_START_SESSION:
                view.startSession();
                break;
            case COMMAND_STOP_SESSION:
                view.stopSession();
                break;
            case COMMAND_REQUEST_FOCUS:
                view.requestNanoFocus();
                break;
            case COMMAND_SET_STATUS_TEXT:
                if (args != null && args.size() > 0) {
                    view.setStatusText(args.getString(0));
                }
                break;
            case COMMAND_SEND_GAMEPAD_STATE:
                if (args != null && args.size() > 0 && !args.isNull(0)) {
                    view.sendGamepadState(args.getMap(0));
                }
                break;
            default:
                break;
        }
    }

    private int commandFromString(String commandId) {
        if ("startSession".equals(commandId)) {
            return COMMAND_START_SESSION;
        }
        if ("stopSession".equals(commandId)) {
            return COMMAND_STOP_SESSION;
        }
        if ("requestFocus".equals(commandId)) {
            return COMMAND_REQUEST_FOCUS;
        }
        if ("setStatusText".equals(commandId)) {
            return COMMAND_SET_STATUS_TEXT;
        }
        if ("sendGamepadState".equals(commandId)) {
            return COMMAND_SEND_GAMEPAD_STATE;
        }
        try {
            return Integer.parseInt(commandId);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topNativeStateChange", MapBuilder.of("registrationName", "onNativeStateChange"))
                .put("topNanoRumble", MapBuilder.of("registrationName", "onNanoRumble"))
                .build();
    }
}
