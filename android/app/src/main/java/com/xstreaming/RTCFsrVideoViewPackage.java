package com.xstreaming;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.oney.WebRTCModule.RTCFsrVideoViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class RTCFsrVideoViewPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        List<ViewManager> managers = new ArrayList<>();
        managers.add(new RTCFsrVideoViewManager());
        return managers;
    }
}
