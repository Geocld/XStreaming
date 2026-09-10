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

import com.facebook.react.modules.network.OkHttpClientProvider;
import com.facebook.react.modules.network.OkHttpClientFactory;
import okhttp3.OkHttpClient;
import okhttp3.Cache;
import okhttp3.ConnectionPool;
import okhttp3.Dns;

import java.io.File;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

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
            packages.add(new NanoStreamPackage());
            packages.add(new UpdateManagerPackage());
            packages.add(new NativeInputDialogPackage());
            packages.add(new ConfigTransferPackage());
            packages.add(new ShortcutManagerPackage());
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

    // High-performance network & image cache configuration
    OkHttpClientProvider.setOkHttpClientFactory(new OkHttpClientFactory() {
      @Override
      public OkHttpClient createNewNetworkModuleClient() {
        File cacheDir = new File(getCacheDir(), "fresco_http_cache");
        Cache cache = new Cache(cacheDir, 250L * 1024 * 1024);

        return OkHttpClientProvider.createClientBuilder()
            .cache(cache)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .connectionPool(new ConnectionPool(20, 5, TimeUnit.MINUTES))
            .dns(new Dns() {
              @Override
              public List<InetAddress> lookup(String hostname) throws UnknownHostException {
                try {
                  return Dns.SYSTEM.lookup(hostname);
                } catch (Exception e) {
                  if (hostname != null && hostname.contains("store-images.s-microsoft.com")) {
                    try {
                      return Arrays.asList(
                        InetAddress.getByName("23.200.181.199"),
                        InetAddress.getByName("23.200.181.187")
                      );
                    } catch (Exception ignored) {}
                  }
                  throw new UnknownHostException("DNS lookup failed for " + hostname + ": " + e.getMessage());
                }
              }
            })
            .build();
      }
    });

    // webrtc
    WebRTCModuleOptions options = WebRTCModuleOptions.getInstance();
    EglBase.Context eglContext = EglUtils.getRootEglBaseContext();
    options.videoEncoderFactory = new H264AndSoftwareVideoEncoderFactory(eglContext);
    if (LowLatencyDecoderConfig.isEnabled(this)) {
        options.videoDecoderFactory = new LowLatencyVideoDecoderFactory(eglContext);
    }

    boolean stereoEnabled = AudioConfig.isStereoEnabled(this);
    AudioAttributes audioAttributes = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build();

    JavaAudioDeviceModule.Builder audioDeviceModuleBuilder =
          JavaAudioDeviceModule.builder(this)
                .setAudioAttributes(audioAttributes)
                .setUseLowLatency(true)
                .setUseStereoInput(false)
                .setUseStereoOutput(stereoEnabled)
                .setEnableVolumeLogger(false);

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
