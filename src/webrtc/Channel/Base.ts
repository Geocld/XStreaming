import webrtcClient from '..';
import 'fast-text-encoding';
// import 'text-encoding-polyfill';

export default class BaseChannel {
  _client: webrtcClient;
  _channelName: string;
  _state: 'new' | 'connected' | 'closing' | 'closed';

  _events: any = {
    state: [],
  };

  _keyframeInterval: any;

  constructor(channelName: string, client: any) {
    this._channelName = channelName;
    this._client = client;
    this._state = 'new';
    this._keyframeInterval = null;
  }

  // Events
  onOpen(event: any) {
    console.log(
      'Channels/Base.ts - [' + this._channelName + '] onOpen:',
      event,
    );
    this.setState('connected');
  }

  // onMessage(event) {
  //     console.log('xSDK channel/base.js - ['+this._channelName+'] onMessage:', event)
  // }

  onClosing(event: any) {
    console.log(
      'xCloudPlayer Channel/Base.ts - [' + this._channelName + '] onClosing:',
      event,
    );
    this.setState('closing');
  }

  onClose(event: any) {
    console.log(
      'xCloudPlayer Channel/Base.ts - [' + this._channelName + '] onClose:',
      event,
    );
    this.setState('closed');
  }

  destroy() {
    // Called when we want to destroy the channel.
  }

  setState(state: any) {
    this._state = state;
  }

  // Channel functions
  send(data: any) {
    const channel = this.getClient().getChannel(this._channelName);

    // Encode to ArrayBuffer if not ArrayBuffer
    if (channel.readyState === 'open') {
      if (this._channelName !== 'input') {
        console.log(
          'Channel/Base.ts - [' + this._channelName + '] Sending message:',
          data,
        );
      }

      if (typeof data === 'string') {
        data = new TextEncoder().encode(data);
        // if (this._channelName !== 'input') {
        //   console.log(
        //     'Channel/Base.ts - [' +
        //       this._channelName +
        //       '] Sending encode data:',
        //     data,
        //   );
        // }
      }

      if (channel.readyState === 'open') {
        channel.send(data);
      }
    } else {
      console.warn(
        'xCloudPlayer Channel/Base.ts - [' +
          this._channelName +
          '] Channel is closed. Failed to send packet:',
        data,
      );
    }
  }

  // Base functions
  getClient() {
    return this._client;
  }

  addEventListener(name: string, callback: any) {
    this._events[name].push(callback);
  }

  emitEvent(name: string, event: any) {
    for (const callback in this._events[name]) {
      this._events[name][callback](event);
    }
  }
}
