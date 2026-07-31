package com.xstreaming;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.xstreaming.nano.NanoStreamViewManager;

import android.util.Log;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NanoStreamPackage implements ReactPackage {
    private static final String TAG = "NanoStreamPackage";

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        Log.i(TAG, "createViewManagers");
        List<ViewManager> managers = new ArrayList<>();
        managers.add(new NanoStreamViewManager());
        return managers;
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
