package com.xstreaming.touchcontrols;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class AnalogStickViewManager extends SimpleViewManager<AnalogStickView> {

    public static final String REACT_CLASS = "AnalogStickView";

    @Override
    @NonNull
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    @NonNull
    public AnalogStickView createViewInstance(ThemedReactContext reactContext) {
        return new AnalogStickView(reactContext);
    }

    @ReactProp(name = "radius")
    public void setRadius(AnalogStickView view, float radius) {
        view.setRadius(radius);
    }

    @ReactProp(name = "handleRadius")
    public void setHandleRadius(AnalogStickView view, float handleRadius) {
        view.setHandleRadius(handleRadius);
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomBubblingEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("onAnalogStickChange",
                        MapBuilder.of(
                                "phasedRegistrationNames",
                                MapBuilder.of("bubbled", "onAnalogStickChange")
                        )
                )
                .build();
    }
}
