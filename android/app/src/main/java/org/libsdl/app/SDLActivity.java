package org.libsdl.app;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Surface;
import android.widget.Toast;

public final class SDLActivity {
  private static final String SDL_ENV_PREFIX = "SDL_ENV.";
  private static Context appContext = null;
  private static boolean nativeReady = false;
  private static boolean screenKeyboardShown = false;

  public static native String nativeGetVersion();
  public static native int nativeSetupJNI();
  public static native int nativeRunMain(String library, String function, Object arguments);
  public static native void onNativeDropFile(String filename);
  public static native void nativeSetScreenResolution(
      int surfaceWidth,
      int surfaceHeight,
      int deviceWidth,
      int deviceHeight,
      float rate);
  public static native void onNativeResize();
  public static native void onNativeSurfaceCreated();
  public static native void onNativeSurfaceChanged();
  public static native void onNativeSurfaceDestroyed();
  public static native void onNativeKeyDown(int keycode);
  public static native void onNativeKeyUp(int keycode);
  public static native boolean onNativeSoftReturnKey();
  public static native void onNativeKeyboardFocusLost();
  public static native void onNativeTouch(
      int touchDeviceId,
      int pointerFingerId,
      int action,
      float x,
      float y,
      float pressure);
  public static native void onNativeMouse(
      int button,
      int action,
      float x,
      float y,
      boolean relative);
  public static native void onNativeAccel(float x, float y, float z);
  public static native void nativeSetenv(String name, String value);
  public static native void onNativeClipboardChanged();
  public static native void nativeLowMemory();
  public static native void onNativeLocaleChanged();
  public static native void nativeSendQuit();
  public static native void nativeQuit();
  public static native void nativePause();
  public static native void nativeResume();
  public static native void nativeFocusChanged(boolean hasFocus);
  public static native String nativeGetHint(String name);
  public static native boolean nativeGetHintBoolean(String name, boolean defaultValue);
  public static native void onNativeOrientationChanged(int orientation);
  public static native void nativeAddTouch(int touchId, String name);
  public static native void nativePermissionResult(int requestCode, boolean result);

  static {
    try {
      System.loadLibrary("SDL2");
    } catch (Throwable ignored) {
    }
  }

  private SDLActivity() {
  }

  public static synchronized void initialize(Context context) {
    if (context != null) {
      appContext = context.getApplicationContext();
    }
    if (!nativeReady) {
      nativeSetupJNI();
      nativeReady = true;
    }
  }

  public static boolean sendMessage(int command, int param) {
    return false;
  }

  public static Context getContext() {
    return appContext;
  }

  public static boolean setActivityTitle(String title) {
    return false;
  }

  public static void setWindowStyle(boolean fullscreen) {
  }

  public static void setOrientation(int width, int height, boolean resizable, String hint) {
  }

  public static boolean isAndroidTV() {
    Context context = getContext();
    if (context == null) {
      return false;
    }
    UiModeManager uiModeManager =
        (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
    return uiModeManager != null &&
        uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
  }

  public static boolean isTablet() {
    DisplayMetrics metrics = getDisplayDPI();
    if (metrics == null || metrics.xdpi <= 0f || metrics.ydpi <= 0f) {
      return false;
    }
    double width = metrics.widthPixels / (double) metrics.xdpi;
    double height = metrics.heightPixels / (double) metrics.ydpi;
    return Math.sqrt(width * width + height * height) >= 7.0;
  }

  public static boolean isChromebook() {
    Context context = getContext();
    return context != null &&
        context.getPackageManager().hasSystemFeature("org.chromium.arc.device_management");
  }

  public static boolean isDeXMode() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
      return false;
    }
    try {
      Context context = getContext();
      if (context == null) {
        return false;
      }
      Configuration config = context.getResources().getConfiguration();
      Class<?> configClass = config.getClass();
      return configClass.getField("SEM_DESKTOP_MODE_ENABLED").getInt(configClass) ==
          configClass.getField("semDesktopModeEnabled").getInt(config);
    } catch (Throwable ignored) {
      return false;
    }
  }

  public static DisplayMetrics getDisplayDPI() {
    Context context = getContext();
    return context == null ? new DisplayMetrics() : context.getResources().getDisplayMetrics();
  }

  public static boolean getManifestEnvironmentVariables() {
    Context context = getContext();
    if (context == null) {
      return false;
    }
    try {
      ApplicationInfo info = context.getPackageManager().getApplicationInfo(
          context.getPackageName(),
          PackageManager.GET_META_DATA);
      Bundle metaData = info.metaData;
      if (metaData == null) {
        return false;
      }
      for (String key : metaData.keySet()) {
        if (key.startsWith(SDL_ENV_PREFIX)) {
          Object value = metaData.get(key);
          if (value != null) {
            nativeSetenv(key.substring(SDL_ENV_PREFIX.length()), String.valueOf(value));
          }
        }
      }
      return true;
    } catch (Throwable ignored) {
      return false;
    }
  }

  public static boolean showTextInput(int x, int y, int width, int height) {
    screenKeyboardShown = true;
    return false;
  }

  public static boolean isScreenKeyboardShown() {
    return screenKeyboardShown;
  }

  public static Surface getNativeSurface() {
    return null;
  }

  public static boolean supportsRelativeMouse() {
    return false;
  }

  public static boolean setRelativeMouseEnabled(boolean enabled) {
    return false;
  }

  public static void manualBackButton() {
  }

  public static void minimizeWindow() {
  }

  public static boolean shouldMinimizeOnFocusLoss() {
    return false;
  }

  public static void requestPermission(String permission, int requestCode) {
  }

  public static int openURL(String url) {
    Context context = getContext();
    if (context == null) {
      return -1;
    }
    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
      return 0;
    } catch (Throwable ignored) {
      return -1;
    }
  }

  public static int showToast(
      String message,
      int duration,
      int gravity,
      int xOffset,
      int yOffset) {
    Context context = getContext();
    if (context == null) {
      return -1;
    }
    Toast.makeText(context, message, duration).show();
    return 0;
  }

  public static int createCustomCursor(
      int[] pixels,
      int width,
      int height,
      int hotSpotX,
      int hotSpotY) {
    return 0;
  }

  public static void destroyCustomCursor(int cursorId) {
  }

  public static boolean setCustomCursor(int cursorId) {
    return false;
  }

  public static boolean setSystemCursor(int cursorId) {
    return false;
  }

  public static void initTouch() {
  }

  public static void clipboardSetText(String text) {
    Context context = getContext();
    if (context == null) {
      return;
    }
    ClipboardManager clipboard =
        (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard != null) {
      clipboard.setPrimaryClip(ClipData.newPlainText("SDL", text));
    }
  }

  public static String clipboardGetText() {
    Context context = getContext();
    if (context == null) {
      return "";
    }
    ClipboardManager clipboard =
        (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard == null || !clipboard.hasPrimaryClip() || clipboard.getPrimaryClip() == null ||
        clipboard.getPrimaryClip().getItemCount() == 0) {
      return "";
    }
    CharSequence text = clipboard.getPrimaryClip().getItemAt(0).coerceToText(context);
    return text == null ? "" : text.toString();
  }

  public static boolean clipboardHasText() {
    return !clipboardGetText().isEmpty();
  }

  public static int messageboxShowMessageBox(
      int flags,
      String title,
      String message,
      int[] buttonFlags,
      int[] buttonIds,
      String[] buttonTexts,
      int[] colors) {
    return -1;
  }
}
