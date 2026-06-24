package org.libsdl.app;

import android.content.Context;

public final class SDLAudioManager {
  private static Context appContext = null;

  public static native int nativeSetupJNI();
  public static native void addAudioDevice(boolean isCapture, int deviceId);
  public static native void removeAudioDevice(boolean isCapture, int deviceId);

  private SDLAudioManager() {
  }

  public static void setContext(Context context) {
    if (context != null) {
      appContext = context.getApplicationContext();
    }
  }

  public static int[] getAudioOutputDevices() {
    return new int[0];
  }

  public static int[] getAudioInputDevices() {
    return new int[0];
  }

  public static int[] audioOpen(
      int sampleRate,
      int audioFormat,
      int channels,
      int desiredFrames,
      int deviceId) {
    return null;
  }

  public static void audioWriteByteBuffer(byte[] buffer) {
  }

  public static void audioWriteShortBuffer(short[] buffer) {
  }

  public static void audioWriteFloatBuffer(float[] buffer) {
  }

  public static void audioClose() {
  }

  public static int[] captureOpen(
      int sampleRate,
      int audioFormat,
      int channels,
      int desiredFrames,
      int deviceId) {
    return null;
  }

  public static int captureReadByteBuffer(byte[] buffer, boolean blocking) {
    return 0;
  }

  public static int captureReadShortBuffer(short[] buffer, boolean blocking) {
    return 0;
  }

  public static int captureReadFloatBuffer(float[] buffer, boolean blocking) {
    return 0;
  }

  public static void captureClose() {
  }

  public static void audioSetThreadPriority(boolean isCapture, int deviceId) {
  }
}
