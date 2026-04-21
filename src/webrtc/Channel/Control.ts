import BaseChannel from './Base';

export default class ControlChannel extends BaseChannel {
  _gamepadSyncTimeout: any = null;

  onOpen(event: any) {
    super.onOpen(event);
    // console.log(
    //   'Channel/Control.ts - [' + this._channelName + '] onOpen:',
    //   event,
    // );
  }

  start() {
    if (this._gamepadSyncTimeout) {
      clearTimeout(this._gamepadSyncTimeout);
      this._gamepadSyncTimeout = null;
    }

    this._sendControlMessage({
      message: 'authorizationRequest',
      accessKey: '4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E',
    });

    this._client._inputDriver.start();

    this.sendGamepadRemoved(0);

    if (this._client._coop) {
      this.sendGamepadRemoved(1);
    }

    this._gamepadSyncTimeout = setTimeout(() => {
      this.sendGamepadAdded(0);
      if (this._client._coop) {
        this.sendGamepadAdded(1);
      }
    }, 500);
  }

  sendVideoKeyframeRequested(ifrRequested = false) {
    this._sendControlMessage({
      message: 'videoKeyframeRequested',
      ifrRequested,
    });
  }

  sendGamepadAdded(gamepadIndex: number) {
    this._sendControlMessage({
      message: 'gamepadChanged',
      gamepadIndex: gamepadIndex,
      wasAdded: true,
    });
  }

  sendGamepadRemoved(gamepadIndex: number) {
    this._sendControlMessage({
      message: 'gamepadChanged',
      gamepadIndex: gamepadIndex,
      wasAdded: false,
    });
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
    if (this._gamepadSyncTimeout) {
      clearTimeout(this._gamepadSyncTimeout);
      this._gamepadSyncTimeout = null;
    }
    this.sendGamepadRemoved(0);

    if (this._client._coop) {
      this.sendGamepadRemoved(1);
    }
  }

  destroy() {
    if (this._gamepadSyncTimeout) {
      clearTimeout(this._gamepadSyncTimeout);
      this._gamepadSyncTimeout = null;
    }
    this.sendGamepadRemoved(0);

    if (this._client._coop) {
      this.sendGamepadRemoved(1);
    }
    super.destroy();
  }

  _sendControlMessage(data: any) {
    const channel = this.getClient().getChannel(this._channelName);
    if (!channel || channel.readyState !== 'open') {
      return;
    }

    this.send(JSON.stringify(data));
  }
}
