import BaseChannel from './Base';
import {mediaDevices} from 'react-native-webrtc';

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
    console.log('Channel/Chat.ts - Enabling Microphone');

    if (this.isCapturing === false) {
      console.log('Start chat...');

      mediaDevices
        .getUserMedia({
          audio: {
            frameRate: 24e3,
          },
        })
        .then(stream => {
          this.isCapturing = true;

          const audioTracks = stream.getAudioTracks();

          if (audioTracks.length > 0) {
            console.log(
              `Channel/Chat.ts - Using Audio device: ${audioTracks[0].label}`,
            );
          } else {
            console.log('Channel/Chat.ts - No Audio device:', audioTracks);
          }

          stream.getTracks().forEach(track => {
            this._client._webrtcClient?.addTrack(track, stream);
          });

          this._client.sdpNegotiationChat();
        })
        .catch(err => {
          console.log(err);
          console.log('Channel/Chat.ts - getUserMedia error:' + err);
          this.isCapturing = false;
        });
    }

    this.isPaused = false;
  }

  stopMic() {
    console.log('Channel/Chat.ts - Disabling Microphone');

    const senders = this._client._webrtcClient?.getSenders();

    for (const sender in senders) {
      // @ts-ignore
      if (senders[sender].track !== null) {
        // @ts-ignore
        if (senders[sender].track?.kind === 'audio') {
          // @ts-ignore
          this._client._webrtcClient?.removeTrack(senders[sender]);
        }
      }
    }

    this.isCapturing = false;
    this.isPaused = true;
  }
}
