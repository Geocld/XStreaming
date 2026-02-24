import BaseChannel from './Base';

export default class ControlChannel extends BaseChannel {
  onOpen(event: any) {
    super.onOpen(event);
    // console.log(
    //   'Channel/Control.ts - [' + this._channelName + '] onOpen:',
    //   event,
    // );
  }

  start() {
    const authRequest = JSON.stringify({
      message: 'authorizationRequest',
      accessKey: '4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E',
    });

    this.send(authRequest);

    this._client._inputDriver.start();

    this.sendGamepadAdded(0);

    this._keyframeInterval = setInterval(() => {
      this.requestKeyframeRequest(true);
    }, 5 * 1000);
  }

  requestKeyframeRequest(ifrRequested = false) {
    console.log('Channel/Control.ts - requestKeyframeRequest');
    const keyframeRequest = JSON.stringify({
      message: 'videoKeyframeRequested',
      ifrRequested: ifrRequested,
    });

    this.send(keyframeRequest);
  }

  sendGamepadAdded(gamepadIndex: number) {
    const gamepadRequest = JSON.stringify({
      message: 'gamepadChanged',
      gamepadIndex: gamepadIndex,
      wasAdded: true,
    });
    this.send(gamepadRequest);
  }

  sendGamepadRemoved(gamepadIndex: number) {
    const gamepadRequest = JSON.stringify({
      message: 'gamepadChanged',
      gamepadIndex: gamepadIndex,
      wasAdded: false,
    });
    this.send(gamepadRequest);
  }

  onMessage(event: any) {
    console.log(
      'Channel/Control.ts - [' + this._channelName + '] onMessage:',
      event,
    );

    const jsonMessage = JSON.parse(event.data);
    console.log('Channel/Control.ts - Received json:', jsonMessage);
  }

  onClose(event: any) {
    super.onClose(event);
    clearInterval(this._keyframeInterval);
  }
}
