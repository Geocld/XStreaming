import BaseChannel from './Base';

import InputPacket from '../Packet';

export interface InputFrame {
  GamepadIndex: number;
  Nexus: number;
  Menu: number;
  View: number;
  A: number;
  B: number;
  X: number;
  Y: number;
  DPadUp: number;
  DPadDown: number;
  DPadLeft: number;
  DPadRight: number;
  LeftShoulder: number;
  RightShoulder: number;
  LeftThumb: number;
  RightThumb: number;

  LeftThumbXAxis: number;
  LeftThumbYAxis: number;
  RightThumbXAxis: number;
  RightThumbYAxis: number;
  LeftTrigger: number;
  RightTrigger: number;
}

export interface PointerFrame {
  events: Array<any>;
}

export interface MouseFrame {
  X: number;
  Y: number;
  WheelX: number;
  WheelY: number;
  Buttons: number;
  Relative: number;
}

export interface KeyboardFrame {
  pressed: boolean;
  keyCode: number;
  key: string;
}

export default class InputChannel extends BaseChannel {
  _inputSequenceNum = 0;

  _reportTypes = {
    None: 0,
    Metadata: 1,
    Gamepad: 2,
    Pointer: 4,
    ClientMetadata: 8,
    ServerMetadata: 16,
    Mouse: 32,
    Keyboard: 64,
    Vibration: 128,
    Sendor: 256,
  };

  _frameMetadataQueue: Array<any> = [];

  _gamepadFrames: Array<InputFrame> = [];
  _inputInterval: any;

  _rumbleInterval = {0: undefined, 1: undefined, 2: undefined, 3: undefined};
  _rumbleEnabled = true;

  constructor(channelName: string, client: any) {
    super(channelName, client);
  }

  onOpen(event: any) {
    super.onOpen(event);
  }

  start() {
    const Packet = new InputPacket(this._inputSequenceNum);
    Packet.setMetadata(2);

    this.send(Packet.toBuffer());

    this.getClient()._inputDriver.run();

    const pollRate = this.getClient()._polling_rate || 62.5;

    this._inputInterval = setInterval(() => {
      const metadataQueue = this.getMetadataQueue();
      const gamepadQueue = this.getGamepadQueue();

      if (metadataQueue.length !== 0 || gamepadQueue.length !== 0) {
        this._inputSequenceNum++;
        const packet = new InputPacket(this._inputSequenceNum);
        packet.setData(metadataQueue, gamepadQueue);

        this.send(packet.toBuffer());
      }
    }, 1000 / pollRate); // 16 ms = 1 frame (1000/60)
  }

  onMessage(event: any) {
    console.log(
      'Channel/Input.ts - [' + this._channelName + '] onMessage:',
      event,
    );

    const dataView = new DataView(event.data);

    let i = 0;
    const reportType = dataView.getUint8(i);
    i += 2;

    if (reportType === this._reportTypes.Vibration) {
      dataView.getUint8(i); // rumbleType: 0 = FourMotorRumble
      // const gamepadIndex = dataView.getUint8(i + 1); // Gamepadindex?
      // console.log('gamepad: ', gamepadIndex);
      i += 2; // Read one unknown byte extra

      const leftMotorPercent = dataView.getUint8(i) / 100;
      const rightMotorPercent = dataView.getUint8(i + 1) / 100;
      const leftTriggerMotorPercent = dataView.getUint8(i + 2) / 100;
      const rightTriggerMotorPercent = dataView.getUint8(i + 3) / 100;
      const durationMs = dataView.getUint16(i + 4, true);
      const delayMs = dataView.getUint16(i + 6, true);
      const repeat = dataView.getUint8(i + 8);
      i += 9;

      const rumbleData = {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: rightMotorPercent,
        strongMagnitude: leftMotorPercent,
        leftTrigger: leftTriggerMotorPercent,
        rightTrigger: rightTriggerMotorPercent,
        delayMs,
        repeat,
      };

      // console.log('rumbleData:', rumbleData);

      this._client._rumbleHandler(rumbleData);
    }
  }

  onClose(event: any) {
    clearInterval(this._inputInterval);

    super.onClose(event);
    console.log(
      'Channel/Input.ts - [' + this._channelName + '] onClose:',
      event,
    );
  }

  getGamepadQueue(size = 30) {
    return this._gamepadFrames.splice(0, size - 1);
  }

  getGamepadQueueLength() {
    return this._gamepadFrames.length;
  }

  queueGamepadState(input: InputFrame) {
    if (input !== null) {
      return this._gamepadFrames.push(input);
    }
  }

  queueGamepadStates(inputs: Array<InputFrame>) {
    for (const input in inputs) {
      this.queueGamepadState(inputs[input]);
    }
  }

  _convertToInt16(e: any) {
    const int = new Int16Array(1);
    return (int[0] = e), int[0];
  }

  _convertToUInt16(e: any) {
    const int = new Uint16Array(1);
    return (int[0] = e), int[0];
  }

  pressButtonStart(button: string) {
    this._client._inputDriver.pressButtonStart(button);
  }

  pressButtonEnd(button: string) {
    this._client._inputDriver.pressButtonEnd(button);
  }

  moveLeftStick(x: number, y: number) {
    this._client._inputDriver.moveLeftStick(x, y);
  }

  moveRightStick(x: number, y: number) {
    this._client._inputDriver.moveRightStick(x, y);
  }

  destroy() {
    clearInterval(this._inputInterval);
    super.destroy();
  }

  addProcessedFrame(frame: any) {
    frame.frameRenderedTimeMs = performance.now();
    this._frameMetadataQueue.push(frame);
  }

  getMetadataQueue(size = 30) {
    return this._frameMetadataQueue.splice(0, size - 1);
  }

  getMetadataQueueLength() {
    return this._frameMetadataQueue.length;
  }
}
