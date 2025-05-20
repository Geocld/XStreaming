import {InputFrame} from '../Channel/Input';

enum ReportTypes {
  None = 0,
  Metadata = 1,
  Gamepad = 2,
  Pointer = 4,
  ClientMetadata = 8,
  ServerMetadata = 16,
  Mouse = 32,
  Keyboard = 64,
  Vibration = 128,
  Sensor = 256,
}

export default class InputPacket {
  _reportType = ReportTypes.None;
  _totalSize = -1;
  _sequence = -1;

  _metadataFrames: Array<any> = [];
  _gamepadFrames: Array<InputFrame> = [];

  _maxTouchpoints = 0;

  constructor(sequence: any) {
    this._sequence = sequence;
  }

  setMetadata(maxTouchpoints = 1) {
    this._reportType = ReportTypes.ClientMetadata;
    this._totalSize = 15;
    this._maxTouchpoints = maxTouchpoints;
  }

  setData(metadataQueue: Array<any>, gamepadQueue: Array<InputFrame>) {
    let size = 14;

    if (metadataQueue.length > 0) {
      this._reportType |= ReportTypes.Metadata;
      size = size + this._calculateMetadataSize(metadataQueue);
      this._metadataFrames = metadataQueue;
    }

    if (gamepadQueue.length > 0) {
      this._reportType |= ReportTypes.Gamepad;
      size = size + this._calculateGamepadSize(gamepadQueue);
      this._gamepadFrames = gamepadQueue;
    }

    this._totalSize = size;
  }

  _calculateMetadataSize(frames: any) {
    return 1 + 7 * 4 * frames.length;
  }

  _calculateGamepadSize(frames: Array<InputFrame>) {
    return 1 + 23 * frames.length;
  }

  _writeMetadataData(packet: DataView, offset: number, frames: Array<any>) {
    packet.setUint8(offset, frames.length);
    offset++;

    if (frames.length >= 30) {
      console.warn(
        'metadataQueue is bigger then 30. This might impact reliability!',
      );
    }

    for (; frames.length > 0; ) {
      // this._metadataFps.count()
      const frame = frames.shift();

      const firstFramePacketArrivalTimeMs = frame.firstFramePacketArrivalTimeMs;
      const frameSubmittedTimeMs = frame.frameSubmittedTimeMs;
      const frameDecodedTimeMs = frame.frameDecodedTimeMs;
      const frameRenderedTimeMs = frame.frameRenderedTimeMs;
      const framePacketTime = performance.now();
      const frameDateNow = performance.now();

      packet.setUint32(offset, frame.serverDataKey, true);
      packet.setUint32(offset + 4, firstFramePacketArrivalTimeMs, true);
      packet.setUint32(offset + 8, frameSubmittedTimeMs, true);
      packet.setUint32(offset + 12, frameDecodedTimeMs, true);
      packet.setUint32(offset + 16, frameRenderedTimeMs, true);
      packet.setUint32(offset + 20, framePacketTime, true);
      packet.setUint32(offset + 24, frameDateNow, true);

      offset += 28;
    }

    return offset;
  }

  _writeGamepadData(
    packet: DataView,
    offset: number,
    frames: Array<InputFrame>,
  ) {
    packet.setUint8(offset, frames.length);
    offset++;

    if (frames.length >= 30) {
      console.warn(
        'gamepadQueue is bigger then 30. This might impact reliability!',
      );
    }

    for (; frames.length > 0; ) {
      // this._inputFps.count()
      const shift = frames.shift();
      if (shift !== undefined) {
        const input: InputFrame = shift;

        packet.setUint8(offset, input.GamepadIndex);
        offset++;

        let buttonMask = 0;
        if (input.Nexus > 0) {
          buttonMask |= 2;
        }
        if (input.Menu > 0) {
          buttonMask |= 4;
        }
        if (input.View > 0) {
          buttonMask |= 8;
        }
        if (input.A > 0) {
          buttonMask |= 16;
        }
        if (input.B > 0) {
          buttonMask |= 32;
        }
        if (input.X > 0) {
          buttonMask |= 64;
        }
        if (input.Y > 0) {
          buttonMask |= 128;
        }
        if (input.DPadUp > 0) {
          buttonMask |= 256;
        }
        if (input.DPadDown > 0) {
          buttonMask |= 512;
        }
        if (input.DPadLeft > 0) {
          buttonMask |= 1024;
        }
        if (input.DPadRight > 0) {
          buttonMask |= 2048;
        }
        if (input.LeftShoulder > 0) {
          buttonMask |= 4096;
        }
        if (input.RightShoulder > 0) {
          buttonMask |= 8192;
        }
        if (input.LeftThumb > 0) {
          buttonMask |= 16384;
        }
        if (input.RightThumb > 0) {
          buttonMask |= 32768;
        }

        packet.setUint16(offset, buttonMask, true);
        packet.setInt16(
          offset + 2,
          this._normalizeAxisValue(input.LeftThumbXAxis),
          true,
        ); // LeftThumbXAxis
        packet.setInt16(
          offset + 4,
          this._normalizeAxisValue(-input.LeftThumbYAxis),
          true,
        ); // LeftThumbYAxis
        packet.setInt16(
          offset + 6,
          this._normalizeAxisValue(input.RightThumbXAxis),
          true,
        ); // RightThumbXAxis
        packet.setInt16(
          offset + 8,
          this._normalizeAxisValue(-input.RightThumbYAxis),
          true,
        ); // RightThumbYAxis
        packet.setUint16(
          offset + 10,
          this._normalizeTriggerValue(input.LeftTrigger),
          true,
        ); // LeftTrigger
        packet.setUint16(
          offset + 12,
          this._normalizeTriggerValue(input.RightTrigger),
          true,
        ); // RightTrigger

        packet.setUint32(offset + 14, 0, true); // PhysicalPhysicality
        packet.setUint32(offset + 18, 0, false); // VirtualPhysicality
        offset += 22;
      }
    }

    return offset;
  }

  toBuffer() {
    const metadataAlloc = new Uint8Array(this._totalSize);
    const packet = new DataView(metadataAlloc.buffer);

    packet.setUint16(0, this._reportType, true);
    packet.setUint32(2, this._sequence, true);
    packet.setFloat64(6, performance.now(), true);

    let offset = 14;

    if (this._metadataFrames.length > 0) {
      offset = this._writeMetadataData(packet, offset, this._metadataFrames);
    }

    if (this._gamepadFrames.length > 0) {
      offset = this._writeGamepadData(packet, offset, this._gamepadFrames);
    }

    if (this._reportType === ReportTypes.ClientMetadata) {
      packet.setUint8(offset, this._maxTouchpoints);
      offset++;
    }

    return packet;
  }

  _normalizeTriggerValue(e: any) {
    if (e < 0) {
      return this._convertToUInt16(0);
    }
    const t = 65535 * e,
      a = t > 65535 ? 65535 : t;
    return this._convertToUInt16(a);
  }

  _normalizeAxisValue(e: any) {
    const t = this._convertToInt16(32767),
      a = this._convertToInt16(-32767),
      n = e * t;
    return n > t ? t : n < a ? a : this._convertToInt16(n);
  }

  _convertToInt16(e: any) {
    const int = new Int16Array(1);
    return (int[0] = e), int[0];
  }

  _convertToUInt16(e: any) {
    const int = new Uint16Array(1);
    return (int[0] = e), int[0];
  }
}
