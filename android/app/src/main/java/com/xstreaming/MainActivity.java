package com.xstreaming;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import com.facebook.react.ReactActivity;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import org.devio.rn.splashscreen.SplashScreen;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.view.InputEvent;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.InputDevice;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import android.view.View;
import android.content.ComponentName;
import android.content.Intent;
import android.os.IBinder;
import android.app.Service;
import android.content.ServiceConnection;
import android.view.WindowManager;

import com.xstreaming.input.UsbDriverService;
import com.xstreaming.input.ControllerHandler;

class Dpad {
  final static int UP       = 19;
  final static int LEFT     = 21;
  final static int RIGHT    = 22;
  final static int DOWN     = 20;
  final static int CENTER   = 23;

  int directionPressed = -1; // initialized to -1

  public int getDirectionPressed(InputEvent event) {
    if (!isDpadDevice(event)) {
      return -1;
    }

    // If the input event is a MotionEvent, check its hat axis values.
    if (event instanceof MotionEvent) {

      // Use the hat axis value to find the D-pad direction
      MotionEvent motionEvent = (MotionEvent) event;
      float xaxis = motionEvent.getAxisValue(MotionEvent.AXIS_HAT_X);
      float yaxis = motionEvent.getAxisValue(MotionEvent.AXIS_HAT_Y);

      // Check if the AXIS_HAT_X value is -1 or 1, and set the D-pad
      // LEFT and RIGHT direction accordingly.
      if (Float.compare(xaxis, -1.0f) == 0) {
        directionPressed =  Dpad.LEFT;
      } else if (Float.compare(xaxis, 1.0f) == 0) {
        directionPressed =  Dpad.RIGHT;
      }
      // Check if the AXIS_HAT_Y value is -1 or 1, and set the D-pad
      // UP and DOWN direction accordingly.
      else if (Float.compare(yaxis, -1.0f) == 0) {
        directionPressed =  Dpad.UP;
      } else if (Float.compare(yaxis, 1.0f) == 0) {
        directionPressed =  Dpad.DOWN;
      }
    }

    // If the input event is a KeyEvent, check its key code.
    else if (event instanceof KeyEvent) {

      // Use the key code to find the D-pad direction.
      KeyEvent keyEvent = (KeyEvent) event;
      if (keyEvent.getKeyCode() == KeyEvent.KEYCODE_DPAD_LEFT) {
        directionPressed = Dpad.LEFT;
      } else if (keyEvent.getKeyCode() == KeyEvent.KEYCODE_DPAD_RIGHT) {
        directionPressed = Dpad.RIGHT;
      } else if (keyEvent.getKeyCode() == KeyEvent.KEYCODE_DPAD_UP) {
        directionPressed = Dpad.UP;
      } else if (keyEvent.getKeyCode() == KeyEvent.KEYCODE_DPAD_DOWN) {
        directionPressed = Dpad.DOWN;
      } else if (keyEvent.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER) {
        directionPressed = Dpad.CENTER;
      }
    }
    return directionPressed;
  }

  public static boolean isDpadDevice(InputEvent event) {
    // Check that input comes from a device with directional pads.
    if ((event.getSource() & InputDevice.SOURCE_DPAD)
            != InputDevice.SOURCE_DPAD) {
      return true;
    } else {
      return false;
    }
  }
}

public class MainActivity extends ReactActivity implements UsbDriverService.UsbDriverStateListener {

  public static MainActivity instance;

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "xstreaming";
  }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    String currentScreen = GamepadManager.getCurrentScreen();
    Log.d("MainActivity1", "keyCode down:" + keyCode);
    Log.d("MainActivity1", "currentScreen:" + currentScreen);

    if (!currentScreen.equals("stream")) {
      return super.onKeyDown(keyCode, event);
    }
    if ((event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
      WritableMap params = Arguments.createMap();
      params.putInt("keyCode", keyCode);
      Log.d("MainActivity1", "keyCode down2:" + params);
      sendEvent("onGamepadKeyDown", params);
      return true;
    }
    return super.onKeyDown(keyCode, event);
  }
  @Override
  public boolean onKeyUp(int keyCode, KeyEvent event) {
    String currentScreen = GamepadManager.getCurrentScreen();

    if (!currentScreen.equals("stream")) {
      return super.onKeyUp(keyCode, event);
    }
    if ((event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
      WritableMap params = Arguments.createMap();
      params.putInt("keyCode", keyCode);
      Log.d("MainActivity1", "keyCode up:" + params);
      sendEvent("onGamepadKeyUp", params);
      return true;
    }
    return super.onKeyUp(keyCode, event);
  }

  private static float getCenteredAxis(MotionEvent event,
                                       InputDevice device, int axis, int historyPos) {
    final InputDevice.MotionRange range =
            device.getMotionRange(axis, event.getSource());

    // A joystick at rest does not always report an absolute position of
    // (0,0). Use the getFlat() method to determine the range of values
    // bounding the joystick axis center.
    if (range != null) {
      final float flat = range.getFlat();
      final float value =
              historyPos < 0 ? event.getAxisValue(axis):
                      event.getHistoricalAxisValue(axis, historyPos);

      // Ignore axis values that are within the 'flat' region of the
      // joystick axis center.
      if (Math.abs(value) > flat) {
        return value;
      }
    }
    return 0;
  }

  private void processJoystickInput(MotionEvent event,
                                    int historyPos) {

    InputDevice inputDevice = event.getDevice();

    // Calculate the horizontal distance to move by
    // using the input value from one of these physical controls:
    // the left control stick, hat axis, or the right control stick.
    float x = getCenteredAxis(event, inputDevice,
            MotionEvent.AXIS_X, historyPos);

    float rx = getCenteredAxis(event, inputDevice,
            MotionEvent.AXIS_Z, historyPos);

    // Calculate the vertical distance to move by
    // using the input value from one of these physical controls:
    // the left control stick, hat switch, or the right control stick.
    float y = getCenteredAxis(event, inputDevice,
            MotionEvent.AXIS_Y, historyPos);

    float ry = getCenteredAxis(event, inputDevice,
            MotionEvent.AXIS_RZ, historyPos);

    Log.d("MainActivity1", "left axisX:" + x);
    Log.d("MainActivity1", "left axisY:" + y);
    WritableMap leftParams = Arguments.createMap();
    leftParams.putDouble("axisX", x);
    leftParams.putDouble("axisY", y);
    sendEvent("onLeftStickMove", leftParams);

    Log.d("MainActivity1", "right axisX:" + rx);
    Log.d("MainActivity1", "right axisY:" + ry);
    WritableMap rightParams = Arguments.createMap();
    rightParams.putDouble("axisX", rx);
    rightParams.putDouble("axisY", ry);
    sendEvent("onRightStickMove", rightParams);
  }

  private static InputDevice.MotionRange getMotionRangeForJoystickAxis(InputDevice dev, int axis) {
    InputDevice.MotionRange range;

    // First get the axis for SOURCE_JOYSTICK
    range = dev.getMotionRange(axis, InputDevice.SOURCE_JOYSTICK);
    if (range == null) {
      // Now try the axis for SOURCE_GAMEPAD
      range = dev.getMotionRange(axis, InputDevice.SOURCE_GAMEPAD);
    }

    return range;
  }

  @Override
  public boolean onGenericMotionEvent(MotionEvent event) {
    InputDevice inputDevice = event.getDevice();

    String currentScreen = GamepadManager.getCurrentScreen();

    if (!currentScreen.equals("stream")) {
      return super.onGenericMotionEvent(event);
    }

    // DPAD
    Dpad dpad = new Dpad();
    if (Dpad.isDpadDevice(event)) {
      int dpadIdx = dpad.getDirectionPressed(event);
      if (dpadIdx != -1) {
        Log.d("MainActivity1", "DPAD press:" + dpadIdx);
        WritableMap params = Arguments.createMap();
        params.putInt("dpadIdx", dpadIdx);
        sendEvent("onDpadKeyDown", params);
      } else {
        WritableMap params = Arguments.createMap();
        params.putInt("dpadIdx", -1);
        sendEvent("onDpadKeyUp", params);
      }
    }

    // Joystick
    if ((event.getSource() & InputDevice.SOURCE_JOYSTICK) ==
            InputDevice.SOURCE_JOYSTICK &&
            event.getAction() == MotionEvent.ACTION_MOVE) {
      // Process all historical movement samples in the batch
      final int historySize = event.getHistorySize();

      InputDevice.MotionRange leftTriggerRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_LTRIGGER);
      InputDevice.MotionRange rightTriggerRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RTRIGGER);
      InputDevice.MotionRange brakeRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_BRAKE);
      InputDevice.MotionRange gasRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_GAS);
      InputDevice.MotionRange throttleRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_THROTTLE);

      // Left Trigger
      float lTrigger = 0;
      // Right Trigger
      float rTrigger = 0;
      if (leftTriggerRange != null && rightTriggerRange != null)
      {
        // Some controllers use LTRIGGER and RTRIGGER (like Ouya)
        lTrigger = event.getAxisValue(MotionEvent.AXIS_LTRIGGER);
        rTrigger = event.getAxisValue(MotionEvent.AXIS_RTRIGGER);
      }
      else if (brakeRange != null && gasRange != null)
      {
        // Others use GAS and BRAKE (like Moga)
        lTrigger = event.getAxisValue(MotionEvent.AXIS_BRAKE);
        rTrigger = event.getAxisValue(MotionEvent.AXIS_GAS);
      }
      else if (brakeRange != null && throttleRange != null)
      {
        // Others use THROTTLE and BRAKE (like Xiaomi)
        lTrigger = event.getAxisValue(MotionEvent.AXIS_BRAKE);
        rTrigger = event.getAxisValue(MotionEvent.AXIS_THROTTLE);
      }
      else
      {
        InputDevice.MotionRange rxRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RX);
        InputDevice.MotionRange ryRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RY);
        String devName = inputDevice.getName();
        if (rxRange != null && ryRange != null && devName != null) {
          boolean isNonStandardDualShock4 = false;
          if (inputDevice.getVendorId() == 0x054c) { // Sony
            if (inputDevice.hasKeys(KeyEvent.KEYCODE_BUTTON_C)[0]) {
              Log.d("MainActivity1", "Detected non-standard DualShock 4 mapping");
              isNonStandardDualShock4 = true;
            }
          }

          if (isNonStandardDualShock4) {
            // The old DS4 driver uses RX and RY for triggers
            lTrigger = event.getAxisValue(MotionEvent.AXIS_RX);
            rTrigger = event.getAxisValue(MotionEvent.AXIS_RY);
          }
          else {
            // While it's likely that Z and RZ are triggers, we may have digital trigger buttons
            // instead. We must check that we actually have Z and RZ axes before assigning them.
            if (getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_Z) != null &&
                    getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RZ) != null) {
              lTrigger = event.getAxisValue(MotionEvent.AXIS_Z);
              rTrigger = event.getAxisValue(MotionEvent.AXIS_RZ);
            }
          }
        }
      }

      Log.d("MainActivity1", "Left Trigger:" + lTrigger);
      Log.d("MainActivity1", "Right Trigger:" + rTrigger);

      WritableMap triggerParams = Arguments.createMap();
      triggerParams.putDouble("leftTrigger", lTrigger);
      triggerParams.putDouble("rightTrigger", rTrigger);
      sendEvent("onTrigger", triggerParams);

      // Process the movements starting from the
      // earliest historical position in the batch
      for (int i = 0; i < historySize; i++) {
        // Process the event at historical position i
        processJoystickInput(event, i);
      }

      // Process the current movement sample in the batch (position -1)
      processJoystickInput(event, -1);
    }
    return true;
  }

  public void sendEvent(String eventName, WritableMap params) {
//    ReactContext reactContext = (ReactContext) getApplicationContext();
    ReactContext reactContext = getReactInstanceManager().getCurrentReactContext();

    if (reactContext != null) {
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(eventName, params);
    }
  }

  public void handleRumble(short lowFreMotor, short highFreMotor) {
    this.controllerHandler.handleRumble(lowFreMotor, highFreMotor);
  }

  public void handleRumbleTrigger(short leftTrigger, short rightTrigger) {
    this.controllerHandler.handleRumbleTriggers(leftTrigger, rightTrigger);
  }

  public void handleSendCommand(byte[] data) {
    this.controllerHandler.handleSendCommand(data);
  }

  private boolean connectedToUsbDriverService = false;
  private ControllerHandler controllerHandler;
  private final ServiceConnection usbDriverServiceConnection = new ServiceConnection() {
    @Override
    public void onServiceConnected(ComponentName componentName, IBinder iBinder) {
      UsbDriverService.UsbDriverBinder binder = (UsbDriverService.UsbDriverBinder) iBinder;
      binder.setListener(controllerHandler);
      binder.setStateListener(MainActivity.this);
      binder.start();
      connectedToUsbDriverService = true;
    }

    @Override
    public void onServiceDisconnected(ComponentName componentName) {
      connectedToUsbDriverService = false;
    }
  };

  @Override
  public void onUsbPermissionPromptStarting() {
  }

  @Override
  public void onUsbPermissionPromptCompleted() {
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(null);

    instance = this;

    controllerHandler = new ControllerHandler(this);

    // Start the USB driver
    bindService(new Intent(this, UsbDriverService.class),
            usbDriverServiceConnection, Service.BIND_AUTO_CREATE);

    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. Here we use a util class {@link
   * DefaultReactActivityDelegate} which allows you to easily enable Fabric and Concurrent React
   * (aka React 18) with two boolean flags.
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    SplashScreen.show(this);
    return new DefaultReactActivityDelegate(
        this,
        getMainComponentName(),
        // If you opted-in for the New Architecture, we enable the Fabric Renderer.
        DefaultNewArchitectureEntryPoint.getFabricEnabled());
  }

}
