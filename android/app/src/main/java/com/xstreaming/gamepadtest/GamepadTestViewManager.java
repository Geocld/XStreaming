package com.xstreaming.gamepadtest;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class GamepadTestViewManager extends SimpleViewManager<GamepadTestView> {
    private static final String REACT_CLASS = "GamepadTestView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected GamepadTestView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new GamepadTestView(reactContext);
    }

    @ReactProp(name = "kernel")
    public void setKernel(GamepadTestView view, @Nullable String kernel) {
        view.setKernel(kernel == null ? "android" : kernel);
    }

    @ReactProp(name = "deadZone")
    public void setDeadZone(GamepadTestView view, float value) {
        view.setDeadZone(value);
    }

    @ReactProp(name = "edgeCompensation")
    public void setEdgeCompensation(GamepadTestView view, int value) {
        view.setEdgeCompensation(value);
    }

    @ReactProp(name = "shortTrigger")
    public void setShortTrigger(GamepadTestView view, boolean value) {
        view.setShortTrigger(value);
    }

    @ReactProp(name = "swapDpad")
    public void setSwapDpad(GamepadTestView view, boolean value) {
        view.setSwapDpad(value);
    }

    @ReactProp(name = "onState")
    public void setOnState(GamepadTestView view, @Nullable Boolean dummy) {}

    @Override
    public void receiveCommand(GamepadTestView view, String commandId, @Nullable ReadableArray args) {}

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topState", MapBuilder.of("registrationName", "onState"))
                .build();
    }
}
