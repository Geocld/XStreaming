import BaseChannel from './Base';
import {mediaDevices} from 'react-native-webrtc';

export default class ChatChannel extends BaseChannel {
  isCapturing = false;
  isPaused = true;
  private micStream: any = null;

  private async getMicStream() {
    return mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  }

  private getAudioSender() {
    const peer = this._client._webrtcClient;
    if (!peer) {
      return null;
    }

    const transceivers = peer.getTransceivers?.() || [];
    for (const transceiver of transceivers) {
      const receiverKind = transceiver?.receiver?.track?.kind;
      const senderKind = transceiver?.sender?.track?.kind;
      if (receiverKind === 'audio' || senderKind === 'audio') {
        return transceiver.sender;
      }
    }

    const senders = peer.getSenders?.() || [];
    return senders.find(sender => sender?.track?.kind === 'audio') || null;
  }

  private stopLocalMicStream() {
    if (!this.micStream) {
      return;
    }

    this.micStream.getTracks().forEach(track => track.stop?.());
    this.micStream = null;
  }

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

  async startMic() {
    console.log('Channel/Chat.ts - Enabling Microphone');

    if (this.isCapturing === true && this.micStream) {
      this.isPaused = false;
      return true;
    }

    try {
      console.log('Start chat...');
      const stream = await this.getMicStream();
      const audioTracks = stream.getAudioTracks();

      if (audioTracks.length === 0) {
        console.log('Channel/Chat.ts - No Audio device:', audioTracks);
        stream.getTracks().forEach(track => track.stop?.());
        this.micStream = null;
        this.isCapturing = false;
        this.isPaused = true;
        return false;
      }

      const [audioTrack] = audioTracks;
      audioTrack.enabled = true;

      console.log(
        `Channel/Chat.ts - Using Audio device: ${audioTrack?.label ?? ''}`,
      );

      const sender = this.getAudioSender();
      if (sender) {
        await sender.replaceTrack(audioTrack);
      } else {
        this._client._webrtcClient?.addTrack(audioTrack, stream);
      }

      this._client.sdpNegotiationChat();
      this.micStream = stream;

      this.isCapturing = true;
      this.isPaused = false;
      return true;
    } catch (err) {
      console.log(err);
      console.log('Channel/Chat.ts - getUserMedia error:' + err);
      this.stopLocalMicStream();
      this.isCapturing = false;
      this.isPaused = true;
      return false;
    }
  }

  stopMic() {
    console.log('Channel/Chat.ts - Disabling Microphone');

    const sender = this.getAudioSender();
    if (sender) {
      sender.replaceTrack(null).catch(error => {
        console.log('Channel/Chat.ts - replaceTrack(null) error:', error);
      });
    }

    this.stopLocalMicStream();

    this.isCapturing = false;
    this.isPaused = true;
  }
}
