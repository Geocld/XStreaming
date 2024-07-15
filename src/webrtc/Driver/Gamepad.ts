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

  _gamepad_mapping = {
    A: '0',
    B: '1',
    X: '2',
    Y: '3',
    DPadUp: '12',
    DPadDown: '13',
    DPadLeft: '14',
    DPadRight: '15',
    LeftShoulder: '4',
    RightShoulder: '5',
    LeftThumb: '10',
    RightThumb: '11',
    LeftTrigger: '6',
    RightTrigger: '7',
    Menu: '9',
    View: '8',
    Nexus: '16',
  };

  _gamepad_axes_mapping = {
    LeftThumbXAxis: '0',
    LeftThumbYAxis: '1',
    RightThumbXAxis: '2',
    RightThumbYAxis: '3',
  };

  _nexusOverrideN = false;

  _isVirtualButtonPressing = false;

  // constructor() {
  // }

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

  normaliseAxis(value: number): number {
    if (this._application) {
      if (Math.abs(value) < this._application._gamepad_deadzone) {
        return 0;
      }

      value = value - Math.sign(value) * this._application._gamepad_deadzone;
      value /= 1.0 - this._application._gamepad_deadzone;

      return value;
    } else {
      return value;
    }
  }

  getDefaultFamepadFrame() {
    return {
      Nexus: 0,
      Menu: 0,
      View: 0,
      A: 0,
      B: 0,
      X: 0,
      Y: 0,
      DPadUp: 0,
      DPadDown: 0,
      DPadLeft: 0,
      DPadRight: 0,
      LeftShoulder: 0,
      RightShoulder: 0,
      LeftThumb: 0,
      RightThumb: 0,

      LeftThumbXAxis: 0,
      LeftThumbYAxis: 0,
      RightThumbXAxis: 0,
      RightThumbYAxis: 0,
      LeftTrigger: 0,
      RightTrigger: 0,
    };
  }

  mapStateLabels(buttons: any, axes: any) {
    const frame = this.getDefaultFamepadFrame() as InputFrame;

    let maping = this._gamepad_mapping;

    if (this._application && this._application._custom_gamepad_mapping) {
      maping = this._application._custom_gamepad_mapping;
    }

    // Set buttons
    for (const button in maping) {
      // NOTE: Some devices dont have nexus button, gamepad.buttons return only 15 length
      if (buttons[maping[button]]) {
        frame[button] = buttons[maping[button]].value || 0;
      }
    }

    // Set axis
    for (const axis in this._gamepad_axes_mapping) {
      frame[axis] = this.normaliseAxis(axes[this._gamepad_axes_mapping[axis]]);
    }
    // Start + Select Nexus menu workaround
    if (frame.View > 0 && frame.Menu > 0) {
      frame.View = 0;
      frame.Menu = 0;

      frame.Nexus = 1;
    }

    return frame;
  }
}
