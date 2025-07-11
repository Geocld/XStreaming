package com.xstreaming.touchcontrols;

import android.graphics.drawable.Drawable;
import android.view.View;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.facebook.react.common.MapBuilder;

import java.util.Map;

public class ButtonViewManager extends SimpleViewManager<ButtonView> {
    @NonNull
    @Override
    public String getName() {
        return "ButtonView";
    }

    @NonNull
    @Override
    protected ButtonView createViewInstance(@NonNull ThemedReactContext reactContext) {
        ButtonView buttonView = new ButtonView(reactContext);
        buttonView.setButtonStateCallback(new ButtonView.ButtonStateCallback() {
            @Override
            public void onPressIn() {
                reactContext.getJSModule(RCTEventEmitter.class)
                        .receiveEvent(buttonView.getId(), "topPressIn", null);
            }

            @Override
            public void onPressOut() {
                reactContext.getJSModule(RCTEventEmitter.class)
                        .receiveEvent(buttonView.getId(), "topPressOut", null);
            }
        });
        return buttonView;
    }

    @ReactProp(name = "buttonName")
    public void setButtonName(ButtonView view, @Nullable String name) {
        view.setButtonName(name);
    }

    @ReactProp(name = "drawableIdle")
    public void setDrawableIdle(ButtonView view, @Nullable ReadableMap source) {
        if (source != null && source.hasKey("uri")) {
            String uri = source.getString("uri");
            int resId = view.getResources().getIdentifier(
                    uri, "drawable", view.getContext().getPackageName());
            if (resId != 0) {
                Drawable drawable = view.getResources().getDrawable(resId);
                view.setDrawableIdle(drawable);
            }
        }
    }

    @ReactProp(name = "drawablePressed")
    public void setDrawablePressed(ButtonView view, @Nullable ReadableMap source) {
        if (source != null && source.hasKey("uri")) {
            String uri = source.getString("uri");
            int resId = view.getResources().getIdentifier(
                    uri, "drawable", view.getContext().getPackageName());
            if (resId != 0) {
                Drawable drawable = view.getResources().getDrawable(resId);
                view.setDrawablePressed(drawable);
            }
        }
    }

    @ReactProp(name = "onPressIn")
    public void setOnPressIn(ButtonView view, @Nullable Boolean dummy) {
        // 这个属性只是用来触发JS回调
    }

    @ReactProp(name = "onPressOut")
    public void setOnPressOut(ButtonView view, @Nullable Boolean dummy) {
        // 这个属性只是用来触发JS回调
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put("topPressIn", MapBuilder.of("registrationName", "onPressIn"))
                .put("topPressOut", MapBuilder.of("registrationName", "onPressOut"))
                .build();
    }
}
