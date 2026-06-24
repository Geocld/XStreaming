package org.libsdl.app;

public final class SDLInputConnection {
  public static native void nativeCommitText(String text, int newCursorPosition);
  public static native void nativeGenerateScancodeForUnichar(char unicode);

  private SDLInputConnection() {
  }
}
