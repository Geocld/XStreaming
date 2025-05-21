import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';

import InputChannel from './Channel/Input';
import ControlChannel from './Channel/Control';
import MessageChannel from './Channel/Message';
import ChatChannel from './Channel/Chat';

import GamepadDriver from './Driver/Gamepad';

globalThis._lastStat = null;

class webRTCClient {
  _webrtcClient: RTCPeerConnection | undefined;
  _iceCandidates: Array<RTCIceCandidate> = [];

  _inputDriver: any = undefined;

  _webrtcConfiguration = {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302',
      },
      {
        urls: 'stun:stun1.l.google.com:19302',
      },
    ],
  };

  _webrtcDataChannelsConfig: any = {
    input: {
      ordered: true,
      protocol: '1.0',
    },
    chat: {
      protocol: 'chatV1',
    },
    control: {
      protocol: 'controlV1',
    },
    message: {
      protocol: 'messageV1',
    },
  };

  _webrtcStates = {
    iceGathering: 'open',
    iceConnection: 'open',
    iceCandidates: [],
    streamConnection: 'open',
  };

  _webrtcDataChannels: any = {};
  _webrtcChannelProcessors: any = {};

  _isResetting = false;
  _gamepad_deadzone = 0.2;
  _custom_gamepad_mapping: any = null;
  _gpState: any = {
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

  constructor() {
    console.log('xstreaming Player loaded!');
  }

  init() {
    this._webrtcClient = new RTCPeerConnection(this._webrtcConfiguration);

    this._openDataChannels();

    this._inputDriver = new GamepadDriver();
    this._inputDriver.setApplication(this);

    this._gatherIce();

    // @ts-ignore
    this._webrtcClient.ontrack = (event: any) => {
      console.log('ontrack:', event);
      this._trackHandler && this._trackHandler(event);
    };

    // @ts-ignore
    this._webrtcClient.onaddstream = (event: any) => {
      console.log('onaddstream:', event);
      this._trackAddHandler && this._trackAddHandler(event);
    };

    this._webrtcClient.addTransceiver('video', {
      direction: 'recvonly',
    });

    this._webrtcClient.addTransceiver('audio', {
      direction: 'sendrecv',
    });

    this._webrtcClient.addEventListener('connectionstatechange', _ => {
      console.log(
        'connectionstatechange:',
        this._webrtcClient?.connectionState,
      );
      this._connectedHandler(this._webrtcClient?.connectionState);
    });

    // this._webrtcClient.addEventListener('iceconnectionstatechange', _ => {
    //   switch (this._webrtcClient?.iceConnectionState) {
    //     case 'connected':
    //     case 'completed':
    //       console.log(
    //         'client.current.iceConnectionState:',
    //         this._webrtcClient?.iceConnectionState,
    //       );
    //       this._connectedHandler(this._webrtcClient?.iceConnectionState);
    //       break;
    //   }
    // });
  }

  createOffer() {
    return new Promise((resolve, reject) => {
      if (this._webrtcClient === undefined) {
        reject('webRTC client not started yet. Run .init() first.');
        return;
      }
      this._webrtcClient
        .createOffer({
          mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true,
          },
        })
        .then(offer => {
          this._webrtcClient?.setLocalDescription(offer).then(() => {
            resolve(offer);
          });
        });
    });
  }

  createOffer2() {
    console.log('createOffer2');
    return new Promise((resolve, reject) => {
      if (this._webrtcClient === undefined) {
        reject('webRTC client not started yet. Run .init() first.');
        return;
      }
      this._webrtcClient
        .createOffer({
          mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true,
          },
        })
        .then(offer => {
          resolve(offer);
        });
    });
  }

  setLocalDescription(offer: any) {
    return new Promise(resolve => {
      this._webrtcClient
        ?.setLocalDescription(offer)
        .then(() => {
          resolve(offer);
        })
        .catch(e => {
          console.log('setLocalDescription error:', e);
        });
    });
  }

  setRemoteOffer(sdpdata: string): Promise<void> {
    return new Promise(resolve => {
      const offerDescription = new RTCSessionDescription({
        type: 'answer',
        sdp: sdpdata,
      });
      this._webrtcClient?.setRemoteDescription(offerDescription).then(() => {
        resolve();
      });
    });
  }

  getIceCandidates() {
    return this._iceCandidates;
  }

  setIceCandidates(iceDetails: any) {
    for (const candidate in iceDetails) {
      if (iceDetails[candidate].candidate === 'a=end-of-candidates') {
        continue;
      }

      const hasInvalidTcpType =
        iceDetails[candidate].candidate.includes('UDP') &&
        iceDetails[candidate].candidate.includes('tcptype');
      if (hasInvalidTcpType) {
        // console.warn('Skipping invalid candidate:', iceDetails[candidate]);
        continue;
      }

      this._webrtcClient?.addIceCandidate({
        candidate: iceDetails[candidate].candidate,
        sdpMid: iceDetails[candidate].sdpMid,
        sdpMLineIndex: parseFloat(iceDetails[candidate].sdpMLineIndex),
      });
    }
  }

  close() {
    if (!this._isResetting) {
      this._isResetting = true;
      this._webrtcClient?.close();

      for (const name in this._webrtcChannelProcessors) {
        this._webrtcChannelProcessors[name].destroy();
      }

      this._webrtcChannelProcessors = {};

      this._inputDriver.stop();
    }
  }

  _trackHandler: any;
  setTrackHandler(listener: any) {
    this._trackHandler = listener;
  }

  _trackAddHandler: any;
  setTrackAddHandler(listener: any) {
    this._trackAddHandler = listener;
  }

  _connectedHandler: any;
  setConnectedHandler(listener: any) {
    this._connectedHandler = listener;
  }

  _gatherIce() {
    console.log('_gatherIce _webrtcClient:', this._webrtcClient);
    this._webrtcClient?.addEventListener('icecandidate', event => {
      if (event.candidate) {
        console.log('xstreaming - ICE candidate found:', event.candidate);
        this._iceCandidates.push(event.candidate);
      }
    });
  }

  _openDataChannels() {
    for (const channel in this._webrtcDataChannelsConfig) {
      this._openDataChannel(channel, this._webrtcDataChannelsConfig[channel]);
    }
  }

  _openDataChannel(name: string, config: any) {
    console.log(
      'xCloudPlayer Library.ts - Creating data channel:',
      name,
      config,
    );

    this._webrtcDataChannels[name] = this._webrtcClient?.createDataChannel(
      name,
      config,
    );

    switch (name) {
      case 'input':
        this._webrtcChannelProcessors[name] = new InputChannel('input', this);
        break;
      case 'control':
        this._webrtcChannelProcessors[name] = new ControlChannel(
          'control',
          this,
        );
        break;
      case 'chat':
        this._webrtcChannelProcessors[name] = new ChatChannel('chat', this);
        break;
      case 'message':
        this._webrtcChannelProcessors[name] = new MessageChannel(
          'message',
          this,
        );
        break;
    }

    // Setup channel processors
    this._webrtcDataChannels[name].addEventListener('open', (event: any) => {
      // const message = event.data;
      if (
        this._webrtcChannelProcessors[name] !== undefined &&
        this._webrtcChannelProcessors[name].onOpen !== undefined
      ) {
        this._webrtcChannelProcessors[name].onOpen(event);
      } else {
        console.log(
          'xCloudPlayer Library.ts - [' + name + '] Got open channel:',
          event,
        );
      }
    });

    this._webrtcDataChannels[name].addEventListener('message', (event: any) => {
      // const message = new Uint8Array(event.data);
      if (
        this._webrtcChannelProcessors[name] !== undefined &&
        this._webrtcChannelProcessors[name].onMessage !== undefined
      ) {
        this._webrtcChannelProcessors[name].onMessage(event);
      } else {
        console.log(
          'xCloudPlayer Library.ts - [' + name + '] Received channel message:',
          event,
        );
      }
    });

    this._webrtcDataChannels[name].addEventListener('closing', (event: any) => {
      // const message = event.data;
      if (
        this._webrtcChannelProcessors[name] !== undefined &&
        this._webrtcChannelProcessors[name].onClosing !== undefined
      ) {
        this._webrtcChannelProcessors[name].onClosing(event);
      } else {
        console.log(
          'xCloudPlayer Library.ts - [' + name + '] Got closing channel:',
          event,
        );
      }
    });

    this._webrtcDataChannels[name].addEventListener('close', (event: any) => {
      // const message = event.data;
      if (
        this._webrtcChannelProcessors[name] !== undefined &&
        this._webrtcChannelProcessors[name].onClose !== undefined
      ) {
        this._webrtcChannelProcessors[name].onClose(event);
      } else {
        console.log(
          'xCloudPlayer Library.ts - [' + name + '] Got close channel:',
          event,
        );
      }
    });

    this._webrtcDataChannels[name].addEventListener('error', (event: any) => {
      // const message = event.data;
      if (
        this._webrtcChannelProcessors[name] !== undefined &&
        this._webrtcChannelProcessors[name].onError !== undefined
      ) {
        this._webrtcChannelProcessors[name].onError(event);
      } else {
        console.log(
          'xCloudPlayer Library.ts - [' + name + '] Got error channel:',
          event,
        );
      }
    });

    // Check if we have a video connection
    if (name === 'input') {
      this._webrtcChannelProcessors[name].addEventListener(
        'state',
        (event: any) => {
          this._webrtcStates.streamConnection = event.state;
          console.log(
            'xCloudPlayer Library.ts - [' +
              name +
              '] Channel state changed to:',
            event,
          );

          // Connected?
        },
      );
    }
  }

  getChannel(name: string) {
    return this._webrtcDataChannels[name];
  }

  getDataChannel(name: string) {
    return this._webrtcDataChannels[name];
  }

  getChannelProcessor(name: string) {
    return this._webrtcChannelProcessors[name];
  }

  setGamepadState(gpState: any) {
    this._gpState = gpState;
  }

  getStreamState() {
    return new Promise(resove => {
      const performances = {
        resolution: '',
        rtt: '-1 (-1%)',
        fps: 0,
        pl: '-1 (-1%)',
        fl: '-1 (-1%)',
        br: '',
        decode: '',
      };
      if (this._webrtcClient) {
        this._webrtcClient.getStats().then(stats => {
          stats.forEach((stat: any) => {
            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
              // FPS
              performances.fps = stat.framesPerSecond || 0;

              // Frames Dropped
              const framesDropped = stat.framesDropped;
              if (framesDropped !== undefined) {
                const framesReceived = stat.framesReceived;
                const framesDroppedPercentage = (
                  (framesDropped * 100) /
                  (framesDropped + framesReceived || 1)
                ).toFixed(2);
                performances.fl = `${framesDropped} (${framesDroppedPercentage}%)`;
              } else {
                performances.fl = '-1 (-1%)';
              }

              // Packets Lost
              const packetsLost = stat.packetsLost;
              if (packetsLost !== undefined) {
                const packetsReceived = stat.packetsReceived;
                const packetsLostPercentage = (
                  (packetsLost * 100) /
                  (packetsLost + packetsReceived || 1)
                ).toFixed(2);
                performances.pl = `${packetsLost} (${packetsLostPercentage}%)`;
              } else {
                performances.pl = '-1 (-1%)';
              }

              if (globalThis._lastStat) {
                try {
                  const lastStat = globalThis._lastStat;
                  // Bitrate
                  const timeDiff = stat.timestamp - lastStat.timestamp;
                  if (timeDiff !== 0) {
                    const bitrate =
                      (8 * (stat.bytesReceived - lastStat.bytesReceived)) /
                      timeDiff /
                      1000;
                    performances.br = `${bitrate.toFixed(2)} Mbps`;
                  } else {
                    performances.br = '--';
                  }

                  // Decode time
                  // Show decode time is a bug on Chromium based browsers on Android,so just reduce it.
                  // Refer: https://github.com/redphx/better-xcloud/discussions/113
                  const totalDecodeTimeDiff =
                    stat.totalDecodeTime - lastStat.totalDecodeTime;
                  const framesDecodedDiff =
                    stat.framesDecoded - lastStat.framesDecoded;
                  if (framesDecodedDiff !== 0) {
                    let currentDecodeTime =
                      (totalDecodeTimeDiff / framesDecodedDiff) * 1000;

                    performances.decode = `${currentDecodeTime.toFixed(2)}ms`;
                  } else {
                    performances.decode = '--';
                  }
                } catch (e) {
                  console.log('err:', e);
                }
              }
              globalThis._lastStat = stat;
            } else if (
              stat.type === 'candidate-pair' &&
              stat.state === 'succeeded'
            ) {
              // Round Trip Time（延迟）
              const roundTripTime =
                typeof stat.currentRoundTripTime !== 'undefined'
                  ? stat.currentRoundTripTime * 1000
                  : '???';
              performances.rtt = `${roundTripTime}ms`;
            }
          });
          resove(performances);
        });
      }
    });
  }
}

export default webRTCClient;
