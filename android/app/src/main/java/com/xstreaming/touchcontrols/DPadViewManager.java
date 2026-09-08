package com.xstreaming.touchcontrols;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.List;
import java.util.Map;

public class DPadViewManager extends SimpleViewManager<DPadView> {
    @NonNull
    @Override
    public String getName() {
        return "DPadView";
    }

    @NonNull
    @Override
    protected DPadView createViewInstance(@NonNull ThemedReactContext reactContext) {
        DPadView view = new DPadView(reactContext);
        view.setDirectionStateCallback(new DPadView.DirectionStateCallback() {
            @Override
            public void onDirectionPressIn(List<String> directions) {
                emitDirections(reactContext, view, "topPressIn", directions);
            }

            @Override
            public void onDirectionPressOut(List<String> directions) {
                emitDirections(reactContext, view, "topPressOut", directions);
            }
        });
        return view;
    }

    private void emitDirections(
            ThemedReactContext reactContext,
            DPadView view,
            String eventName,
            List<String> directions) {
        WritableMap event = Arguments.createMap();
        WritableArray array = Arguments.createArray();
        for (String direction : directions) {
            array.pushString(direction);
        }
        event.putArray("directions", array);
        if (directions.size() == 1) {
            event.putString("direction", directions.get(0));
        }
        reactContext.getJSModule(RCTEventEmitter.class).receiveEvent(view.getId(), eventName, event);
    }

    @ReactProp(name = "onPressIn")
    public void setOnPressIn(DPadView view, @Nullable Boolean dummy) {}

    @ReactProp(name = "onPressOut")
    public void setOnPressOut(DPadView view, @Nullable Boolean dummy) {}

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topPressIn", MapBuilder.of("registrationName", "onPressIn"))
                .put("topPressOut", MapBuilder.of("registrationName", "onPressOut"))
                .build();
    }
}
