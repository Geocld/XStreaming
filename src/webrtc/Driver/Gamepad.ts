import webRTCClient from '..';
import Driver from './Driver';

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

  _timer: any = null;

  setApplication(application: webRTCClient) {
    this._application = application;
  }

  start() {}

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
    }
  }

  pressButtonStart(button: string) {
    // console.log('pressButtonStart:', button);
    this._isVirtualButtonPressing = true;

    this._shadowGamepad[button] = 1;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad);
  }

  pressButtonEnd(button: string) {
    // console.log('pressButtonEnd:', button);
    this._shadowGamepad[button] = 0;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad);
    this._isVirtualButtonPressing = false;
  }

  // left stick move
  moveLeftStick(x: number, y: number) {
    if (x !== 0 || y !== 0) {
      this._isVirtualButtonPressing = true;
    } else {
      this._isVirtualButtonPressing = false;
    }
    this._shadowGamepad.LeftThumbXAxis = x;
    this._shadowGamepad.LeftThumbYAxis = -y;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad);
  }

  // right stick move
  moveRightStick(x: number, y: number) {
    if (x !== 0 || y !== 0) {
      this._isVirtualButtonPressing = true;
    } else {
      this._isVirtualButtonPressing = false;
    }
    this._shadowGamepad.RightThumbXAxis = x;
    this._shadowGamepad.RightThumbYAxis = -y;
    this._application
      ?.getChannelProcessor('input')
      .queueGamepadState(this._shadowGamepad);
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
    const pollRate = this._application?._polling_rate || 62.5;
    this._timer = setTimeout(() => {
      this.run();
    }, 1000 / pollRate);
  }
}
