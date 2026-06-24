package com.xstreaming;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.xstreaming.gamepadtest.GamepadTestViewManager;

import java.util.ArrayList;
import java.util.List;

public class GamepadPackage implements ReactPackage {
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        List<ViewManager> viewManagers = new ArrayList<>();
        viewManagers.add(new GamepadTestViewManager());
        return viewManagers;
    }

    @Override
    public List<NativeModule> createNativeModules(
            ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();

        modules.add(new GamepadManager(reactContext));
        modules.add(new SdlGamepadManager(reactContext));

        return modules;
    }
}
