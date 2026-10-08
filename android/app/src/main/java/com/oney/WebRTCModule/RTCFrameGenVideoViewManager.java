package com.oney.WebRTCModule;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class RTCFrameGenVideoViewManager extends SimpleViewManager<RTCFrameGenVideoView> {
    private static final String REACT_CLASS = "RTCFrameGenVideoView";

    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @Override
    public RTCFrameGenVideoView createViewInstance(ThemedReactContext context) {
        return new RTCFrameGenVideoView(context);
    }

    @ReactProp(name = "mirror")
    public void setMirror(RTCFrameGenVideoView view, boolean mirror) {
        view.setMirror(mirror);
    }

    @ReactProp(name = "objectFit")
    public void setObjectFit(RTCFrameGenVideoView view, String objectFit) {
        view.setObjectFit(objectFit);
    }

    @ReactProp(name = "streamURL")
    public void setStreamURL(RTCFrameGenVideoView view, String streamURL) {
        view.setStreamURL(streamURL);
    }

    @ReactProp(name = "zOrder")
    public void setZOrder(RTCFrameGenVideoView view, int zOrder) {
        view.setZOrder(zOrder);
    }

    @ReactProp(name = "videoFormat")
    public void setVideoFormat(RTCFrameGenVideoView view, String videoFormat) {
        view.setVideoFormat(videoFormat);
    }

    @ReactProp(name = "fsrEnabled", defaultBoolean = false)
    public void setFsrEnabled(RTCFrameGenVideoView view, boolean enabled) {
        view.setFsrEnabled(enabled);
    }

    @ReactProp(name = "fsrSharpness", defaultFloat = 2f)
    public void setFsrSharpness(RTCFrameGenVideoView view, float sharpness) {
        view.setFsrSharpness(sharpness);
    }

    @ReactProp(name = "logVerbose", defaultBoolean = false)
    public void setLogVerbose(RTCFrameGenVideoView view, boolean enabled) {
        view.setLogVerbose(enabled);
    }

    @ReactProp(name = "framegenFp16", defaultBoolean = false)
    public void setFramegenFp16(RTCFrameGenVideoView view, boolean enabled) {
        view.setFramegenFp16(enabled);
    }

    @ReactProp(name = "videoFps", defaultInt = 60)
    public void setVideoFps(RTCFrameGenVideoView view, int fps) {
        view.setVideoFps(fps);
    }
}
