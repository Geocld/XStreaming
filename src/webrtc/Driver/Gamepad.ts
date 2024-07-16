import webRTCClient from '..';
import {InputFrame} from '../Channel/Input';
import Driver from './Dri';

const KEYCODE_KEY_N = 'n';

export default class GamepadDriver implements Driver {
  _application: webRTCClient | null = null;

  _shadowGamepad: any = {
    A: 0,
    B: 0,
    X: 0,
    Y: 0,
    LeftShoulder: 0,
    RightShoulder: 0,
    LeftTrigger: 0,
    RightTrigger: 0,
    View: 0,
    Menu: 0,
    LeftThumb: 0,
    RightThumb: 0,
    DPadUp: 0,
    DPadDown: 0,
    DPadLeft: 0,
    DPadRight: 0,
    Nexus: 0,

    LeftThumbXAxis: 0.0,
    LeftThumbYAxis: 0.0,
    RightThumbXAxis: 0.0,
    RightThumbYAxis: 0.0,
  };

  _isVirtualButtonPressing = false;

  setApplication(application: webRTCClient) {
    this._application = application;
  }

  start() {}

  stop() {}

  pressButtonStart(button: string) {
    console.log('pressButtonStart:', button);
    this._isVirtualButtonPressing = true;

    this._shadowGamepad[button] = 1;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad);
  }

  pressButtonEnd(button: string) {
    console.log('pressButtonEnd:', button);
    this._shadowGamepad[button] = 0;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad);
    this._isVirtualButtonPressing = false;
  }

  // left stick move
  moveLeftStick(index: number, x: number, y: number) {
    if (x !== 0 || y !== 0) {
      this._isVirtualButtonPressing = true;
    } else {
      this._isVirtualButtonPressing = false;
    }
    this._shadowGamepad[index].LeftThumbXAxis = x;
    this._shadowGamepad[index].LeftThumbYAxis = -y;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad[index]);
  }

  // right stick move
  moveRightStick(index: number, x: number, y: number) {
    if (x !== 0 || y !== 0) {
      this._isVirtualButtonPressing = true;
    } else {
      this._isVirtualButtonPressing = false;
    }
    this._shadowGamepad[index].RightThumbXAxis = x;
    this._shadowGamepad[index].RightThumbYAxis = -y;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad[index]);
  }

  // Only ran when new gamepad driver is selected
  run() {
    let gpState = [this._application?._gpState];

    if (!this._isVirtualButtonPressing) {
      this._application
        ?.getChannelProcessor('input')
        .queueGamepadStates(gpState);
    }

    // requestAnimationFrame(() => { this.run() })
    setTimeout(() => {
      this.run();
    }, 1000 / 120);
  }
}
