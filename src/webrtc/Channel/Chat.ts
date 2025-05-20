import BaseChannel from './Base';

export default class ChatChannel extends BaseChannel {
  isCapturing = false;
  isPaused = true;

  onOpen(event: any) {
    super.onOpen(event);
    // console.log(
    //   'Channel/Control.ts - [' + this._channelName + '] onOpen:',
    //   event,
    // );
  }

  start() {
    // Do nothing
  }

  onMessage(event: any) {
    console.log(
      'Channel/Chat.ts - [' + this._channelName + '] onMessage:',
      event,
    );

    const jsonMessage = JSON.parse(event.data);
    console.log('Channel/Chat.ts - Received json:', jsonMessage);
  }

  onClose(event: any) {
    super.onClose(event);
    // console.log('Channel/Control.ts - ['+this._channelName+'] onClose:', event)
  }

  startMic() {
    // TODO
  }

  stopMic() {
    // TODO
  }
}
