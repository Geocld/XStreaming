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
import com.oney.WebRTCModule.EglUtils;
import com.oney.WebRTCModule.webrtcutils.H264AndSoftwareVideoEncoderFactory;
import com.xstreaming.touchcontrols.AnalogStickPackage;
import com.xstreaming.touchcontrols.ButtonViewPackage;
import com.xstreaming.webrtc.LowLatencyVideoDecoderFactory;

import android.media.AudioAttributes;
import org.webrtc.EglBase;
import org.webrtc.audio.JavaAudioDeviceModule;

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
            packages.add(new PipPackage());
            packages.add(new UsbRumblePackage());
            packages.add(new BatteryPackage());
            packages.add(new SensorPackage());
            packages.add(new GamepadSensorPackage());
            packages.add(new AnalogStickPackage());
            packages.add(new ButtonViewPackage());
            packages.add(new AudioSettingPackage());
            packages.add(new RTCFsrVideoViewPackage());
            packages.add(new UpdateManagerPackage());
            packages.add(new NativeInputDialogPackage());
            packages.add(new ConfigTransferPackage());
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
    EglBase.Context eglContext = EglUtils.getRootEglBaseContext();
    options.videoEncoderFactory = new H264AndSoftwareVideoEncoderFactory(eglContext);
    if (LowLatencyDecoderConfig.isEnabled(this)) {
        options.videoDecoderFactory = new LowLatencyVideoDecoderFactory(eglContext);
    }

    boolean stereoEnabled = AudioConfig.isStereoEnabled(this);
    AudioAttributes audioAttributes = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build();

    JavaAudioDeviceModule.Builder audioDeviceModuleBuilder =
          JavaAudioDeviceModule.builder(this)
                .setAudioAttributes(audioAttributes)
                .setEnableVolumeLogger(false);

    if (stereoEnabled) {
        audioDeviceModuleBuilder
              .setUseStereoInput(true)
              .setUseStereoOutput(true);
    } else {
        audioDeviceModuleBuilder
              .setUseLowLatency(true)
              .setUseStereoInput(false)
              .setUseStereoOutput(false);
    }

    options.audioDeviceModule = audioDeviceModuleBuilder.createAudioDeviceModule();

    UMConfigure.preInit(this,"66ab42a4192e0574e75249b9","XStreaming");
    UMConfigure.init(this, "66ab42a4192e0574e75249b9", "XStreaming", UMConfigure.DEVICE_TYPE_PHONE, "");
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      DefaultNewArchitectureEntryPoint.load();
    }
    ReactNativeFlipper.initializeFlipper(this, getReactNativeHost().getReactInstanceManager());
  }
}
