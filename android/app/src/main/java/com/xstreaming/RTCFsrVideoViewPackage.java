package com.xstreaming;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.oney.WebRTCModule.RTCFsrVideoViewManager;
import com.oney.WebRTCModule.RTCFrameGenVideoViewManager;
import com.xstreaming.framegen.FrameGenStatsModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class RTCFsrVideoViewPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new FrameGenStatsModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        List<ViewManager> managers = new ArrayList<>();
        managers.add(new RTCFsrVideoViewManager());
        managers.add(new RTCFrameGenVideoViewManager());
        return managers;
    }
}
