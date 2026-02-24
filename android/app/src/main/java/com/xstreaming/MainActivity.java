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
import com.facebook.react.bridge.WritableArray;
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
import com.xstreaming.utils.Vector2d;

import java.util.ArrayList;
import java.util.List;

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

  private final Vector2d inputVector = new Vector2d();

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "xstreaming";
  }

  private void handleSendDpadDownEvent(List<Integer> keyCodes) {
    WritableMap params = Arguments.createMap();
    WritableArray dpadList = Arguments.createArray();
    for (Integer code : keyCodes) {
      dpadList.pushInt(code);
    }

    int primaryCode = keyCodes.isEmpty() ? -1 : keyCodes.get(0);
    params.putInt("dpadIdx", primaryCode);
    params.putArray("dpadIdxList", dpadList);
    sendEvent("onDpadKeyDown", params);
  }

  private void handleSendDpadDownEvent(int keyCode) {
    List<Integer> keyCodes = new ArrayList<>();
    keyCodes.add(keyCode);
    handleSendDpadDownEvent(keyCodes);
  }

  private void handleSendDpadUpEvent() {
    WritableMap params = Arguments.createMap();
    WritableArray dpadList = Arguments.createArray();
    params.putInt("dpadIdx", -1);
    params.putArray("dpadIdxList", dpadList);
    sendEvent("onDpadKeyUp", params);
  }

  private int handleRemapping(int keyCode, KeyEvent event, String type) {
    InputDevice inputDevice = event.getDevice();
    // Joycon left
    if (inputDevice.getVendorId() == 0x057e && inputDevice.getProductId() == 0x2006) {
      switch (event.getScanCode())
      {
        case 546:
          if (type.equals("down")) {
            handleSendDpadDownEvent(KeyEvent.KEYCODE_DPAD_LEFT);
          } else {
            handleSendDpadUpEvent();
          }
          return KeyEvent.KEYCODE_DPAD_LEFT;
        case 547:
          if (type.equals("down")) {
            handleSendDpadDownEvent(KeyEvent.KEYCODE_DPAD_RIGHT);
          } else {
            handleSendDpadUpEvent();
          }
          return KeyEvent.KEYCODE_DPAD_RIGHT;
        case 544:
          if (type.equals("down")) {
            handleSendDpadDownEvent(KeyEvent.KEYCODE_DPAD_UP);
          } else {
            handleSendDpadUpEvent();
          }
          return KeyEvent.KEYCODE_DPAD_UP;
        case 545:
          if (type.equals("down")) {
            handleSendDpadDownEvent(KeyEvent.KEYCODE_DPAD_DOWN);
          } else {
            handleSendDpadUpEvent();
          }
          return KeyEvent.KEYCODE_DPAD_DOWN;
        case 309: // screenshot
          return KeyEvent.KEYCODE_BUTTON_MODE;
        case 310:
          return KeyEvent.KEYCODE_BUTTON_L1;
        case 312:
          return KeyEvent.KEYCODE_BUTTON_L2;
        case 314:
          return KeyEvent.KEYCODE_BUTTON_SELECT;
        case 317:
          return KeyEvent.KEYCODE_BUTTON_THUMBL;
      }
    }
    // Joycon right
    if (inputDevice.getVendorId() == 0x057e && inputDevice.getProductId() == 0x2007) {
      switch (event.getScanCode())
      {
        case 307:
          return KeyEvent.KEYCODE_BUTTON_Y;
        case 308:
          return KeyEvent.KEYCODE_BUTTON_X;
        case 304:
          return KeyEvent.KEYCODE_BUTTON_A;
        case 305:
          return KeyEvent.KEYCODE_BUTTON_B;
        case 311:
          return KeyEvent.KEYCODE_BUTTON_R1;
        case 313:
          return KeyEvent.KEYCODE_BUTTON_R2;
        case 315:
          return KeyEvent.KEYCODE_BUTTON_START;
        case 316:
          return KeyEvent.KEYCODE_BUTTON_MODE;
        case 318:
          return KeyEvent.KEYCODE_BUTTON_THUMBR;
      }
    }
    return keyCode;
  }

  @Override
  public boolean onKeyDown(int keyCode, KeyEvent event) {
    String currentScreen = GamepadManager.getCurrentScreen();
//    Log.d("MainActivity1", "currentScreen:" + currentScreen);

    if (!currentScreen.equals("stream")) {
      return super.onKeyDown(keyCode, event);
    }
    if ((event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
      int finalKeyCode = handleRemapping(keyCode, event, "down");
      WritableMap params = Arguments.createMap();
      params.putInt("keyCode", finalKeyCode);
//      Log.d("MainActivity1", "keyCode down:" + keyCode);
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
      int finalKeyCode = handleRemapping(keyCode, event, "up");
      WritableMap params = Arguments.createMap();
      params.putInt("keyCode", finalKeyCode);
//      Log.d("MainActivity1", "keyCode up:" + params);
      sendEvent("onGamepadKeyUp", params);
      return true;
    }
    return super.onKeyUp(keyCode, event);
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

  private Vector2d populateCachedVector(float x, float y) {
    // Reinitialize our cached Vector2d object
    inputVector.initialize(x, y);
    return inputVector;
  }

  private void handleDeadZone(Vector2d stickVector, float deadzoneRadius) {
    if (stickVector.getMagnitude() <= deadzoneRadius) {
      // Deadzone
      stickVector.initialize(0, 0);
    }

    // We're not normalizing here because we let the computer handle the deadzones.
    // Normalizing can make the deadzones larger than they should be after the computer also
    // evaluates the deadzone.
  }

  @Override
  public boolean onGenericMotionEvent(MotionEvent event) {
    InputDevice inputDevice = event.getDevice();

    String currentScreen = GamepadManager.getCurrentScreen();

    if (!currentScreen.equals("stream")) {
      return super.onGenericMotionEvent(event);
    }

    // DPAD
    if (Dpad.isDpadDevice(event) && event instanceof MotionEvent) {
      MotionEvent motionEvent = (MotionEvent) event;
      float xaxis = motionEvent.getAxisValue(MotionEvent.AXIS_HAT_X);
      float yaxis = motionEvent.getAxisValue(MotionEvent.AXIS_HAT_Y);
      List<Integer> pressedDirections = new ArrayList<>();

      if (Float.compare(xaxis, -1.0f) == 0) {
        pressedDirections.add(KeyEvent.KEYCODE_DPAD_LEFT);
      } else if (Float.compare(xaxis, 1.0f) == 0) {
        pressedDirections.add(KeyEvent.KEYCODE_DPAD_RIGHT);
      }

      if (Float.compare(yaxis, -1.0f) == 0) {
        pressedDirections.add(KeyEvent.KEYCODE_DPAD_UP);
      } else if (Float.compare(yaxis, 1.0f) == 0) {
        pressedDirections.add(KeyEvent.KEYCODE_DPAD_DOWN);
      }

      if (!pressedDirections.isEmpty()) {
        Log.d("MainActivity1", "DPAD press:" + pressedDirections);
        handleSendDpadDownEvent(pressedDirections);
      } else {
        handleSendDpadUpEvent();
      }
    }

    // Trigger
    if ((event.getSource() & InputDevice.SOURCE_JOYSTICK) ==
            InputDevice.SOURCE_JOYSTICK &&
            event.getAction() == MotionEvent.ACTION_MOVE) {

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

//      Log.d("MainActivity1", "Left Trigger:" + lTrigger);
//      Log.d("MainActivity1", "Right Trigger:" + rTrigger);

      WritableMap triggerParams = Arguments.createMap();
      triggerParams.putDouble("leftTrigger", lTrigger);
      triggerParams.putDouble("rightTrigger", rTrigger);
      sendEvent("onTrigger", triggerParams);

      int deadzonePercentage = 10;
      int leftStickXAxis = MotionEvent.AXIS_X;
      int leftStickYAxis = MotionEvent.AXIS_Y;
      int rightStickXAxis = -1;
      int rightStickYAxis = -1;
      double stickDeadzone = (double)deadzonePercentage / 100.0;
      float leftStickDeadzoneRadius = (float) stickDeadzone;
      float rightStickDeadzoneRadius = (float) stickDeadzone;

      InputDevice.MotionRange zRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_Z);
      InputDevice.MotionRange rzRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RZ);

      if (zRange != null && rzRange != null) {
        rightStickXAxis = MotionEvent.AXIS_Z;
        rightStickYAxis = MotionEvent.AXIS_RZ;
      } else {
        // Try RX and RY now
        InputDevice.MotionRange rxRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RX);
        InputDevice.MotionRange ryRange = getMotionRangeForJoystickAxis(inputDevice, MotionEvent.AXIS_RY);

        if (rxRange != null && ryRange != null) {
          rightStickXAxis = MotionEvent.AXIS_RX;
          rightStickYAxis = MotionEvent.AXIS_RY;
        }
      }

      float lsX = 0, lsY = 0, rsX = 0, rsY = 0, rt = 0, lt = 0, hatX = 0, hatY = 0;
      lsX = event.getAxisValue(leftStickXAxis);
      lsY = event.getAxisValue(leftStickYAxis);

      rsX = event.getAxisValue(rightStickXAxis);
      rsY = event.getAxisValue(rightStickYAxis);

      // Left stick
      Vector2d leftStickVector = populateCachedVector(lsX, lsY);
      handleDeadZone(leftStickVector, leftStickDeadzoneRadius);

      double leftStickX = leftStickVector.getX();
      double leftStickY = leftStickVector.getY();

      if(leftStickX > 1) {
        leftStickX = 1;
      }
      if(leftStickX < -1) {
        leftStickX = -1;
      }
      if(leftStickY > 1) {
        leftStickY = 1;
      }
      if(leftStickY < -1) {
        leftStickY = -1;
      }

//      Log.d("MainActivity1", "left axisX:" + leftStickX);
//      Log.d("MainActivity1", "left axisY:" + leftStickY);

      // Right stick
      Vector2d rightStickVector = populateCachedVector(rsX, rsY);

      handleDeadZone(rightStickVector, rightStickDeadzoneRadius);

      double rightStickX = rightStickVector.getX();
      double rightStickY = rightStickVector.getY();

      if(rightStickX > 1) {
        rightStickX = 1;
      }
      if(rightStickX < -1) {
        rightStickX = -1;
      }
      if(rightStickY > 1) {
        rightStickY = 1;
      }
      if(rightStickY < -1) {
        rightStickY = -1;
      }

      //  Log.d("MainActivity1", "right axisX:" + rightStickX);
      //  Log.d("MainActivity1", "right axisY:" + rightStickY);
      WritableMap stickParams = Arguments.createMap();
      stickParams.putDouble("leftStickX", leftStickX);
      stickParams.putDouble("leftStickY", leftStickY);
      stickParams.putDouble("rightStickX", rightStickX);
      stickParams.putDouble("rightStickY", rightStickY);
      sendEvent("onStickMove", stickParams);
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
