package com.oney.WebRTCModule;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class RTCFsrVideoViewManager extends SimpleViewManager<RTCFsrVideoView> {
    private static final String REACT_CLASS = "RTCFsrVideoView";

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    public RTCFsrVideoView createViewInstance(ThemedReactContext context) {
        return new RTCFsrVideoView(context);
    }

    @ReactProp(name = "mirror")
    public void setMirror(RTCFsrVideoView view, boolean mirror) {
        view.setMirror(mirror);
    }

    @ReactProp(name = "objectFit")
    public void setObjectFit(RTCFsrVideoView view, String objectFit) {
        view.setObjectFit(objectFit);
    }

    @ReactProp(name = "streamURL")
    public void setStreamURL(RTCFsrVideoView view, String streamURL) {
        view.setStreamURL(streamURL);
    }

    @ReactProp(name = "zOrder")
    public void setZOrder(RTCFsrVideoView view, int zOrder) {
        view.setZOrder(zOrder);
    }

    @ReactProp(name = "videoFormat")
    public void setVideoFormat(RTCFsrVideoView view, String videoFormat) {
        view.setVideoFormat(videoFormat);
    }

    @ReactProp(name = "fsrEnabled", defaultBoolean = true)
    public void setFsrEnabled(RTCFsrVideoView view, boolean enabled) {
        view.setFsrEnabled(enabled);
    }

    @ReactProp(name = "fsrSharpness", defaultFloat = 2f)
    public void setFsrSharpness(RTCFsrVideoView view, float sharpness) {
        view.setFsrSharpness(sharpness);
    }
}
