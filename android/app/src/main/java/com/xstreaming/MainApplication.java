package com.xstreaming;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;
import com.umeng.commonsdk.UMConfigure;

import com.oney.WebRTCModule.WebRTCModuleOptions;
import com.xstreaming.touchcontrols.AnalogStickPackage;
import com.xstreaming.touchcontrols.ButtonViewPackage;

import android.content.Context;
import android.media.AudioAttributes;
import org.webrtc.audio.JavaAudioDeviceModule;

import android.media.AudioManager;
import android.util.Log;

import java.util.HashMap;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = new PackageList(this).getPackages();
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // packages.add(new MyReactNativePackage());
            packages.add(new XalPackage());
            packages.add(new FullScreenPackage());
            packages.add(new GamepadPackage());
            packages.add(new UsbRumblePackage());
            packages.add(new BatteryPackage());
            packages.add(new SensorPackage());
            packages.add(new GamepadSensorPackage());
            packages.add(new AnalogStickPackage());
            packages.add(new ButtonViewPackage());
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
          return BuildConfig.IS_HERMES_ENABLED;
        }
      };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @Override
  public void onCreate() {
    super.onCreate();
    SoLoader.init(this, /* native exopackage */ false);

    // webrtc
    WebRTCModuleOptions options = WebRTCModuleOptions.getInstance();
    AudioAttributes audioAttributes = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build();

    AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    boolean isStereoSupported = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE) != null;

    options.audioDeviceModule = JavaAudioDeviceModule.builder(this)
            .setAudioAttributes(audioAttributes)
            .setUseStereoInput(isStereoSupported)
            .setUseStereoOutput(isStereoSupported)
            .createAudioDeviceModule();

    UMConfigure.preInit(this,"66ab42a4192e0574e75249b9","XStreaming");
    UMConfigure.init(this, "66ab42a4192e0574e75249b9", "XStreaming", UMConfigure.DEVICE_TYPE_PHONE, "");
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      DefaultNewArchitectureEntryPoint.load();
    }
    ReactNativeFlipper.initializeFlipper(this, getReactNativeHost().getReactInstanceManager());
  }
}
