import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Alert,
  NativeModules,
  Vibration,
  NativeEventEmitter,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import {WebView} from 'react-native-webview';
import XcloudApi from '../xCloud';
import {useSelector} from 'react-redux';
import {getSettings} from '../store/settingStore';
import Spinner from 'react-native-loading-spinner-overlay';
import {useTranslation} from 'react-i18next';
import {RTCView, MediaStream} from 'react-native-webrtc';
import webRTCClient from '../webrtc';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';
import VirtualGamepad from '../components/VirtualGamepad';

const log = debugFactory('NewStreamScreen');

const {FullScreenManager, GamepadManager} = NativeModules;

const defaultMaping = GAMEPAD_MAPING;

const gpState = {
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

function NativeStreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const streamingTokens = useSelector(state => state.streamingTokens);

  const [streamApi, setStreamApi] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [loadingText, setLoadingText] = React.useState('');
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [performance, setPerformance] = React.useState(null);

  const [webrtcClient, setWebrtcClient] = React.useState(undefined);
  const [remote, setRemote] = React.useState(null);
  const remoteStream = React.useRef(null);
  const keepaliveInterval = React.useRef(null);
  const performanceInterval = React.useRef(null);

  React.useEffect(() => {
    FullScreenManager.immersiveModeOn();

    setTimeout(() => {
      Orientation.lockToLandscape();
    }, 500);
  });

  const handleButtonPressIn = name => {
    webrtcClient.getChannelProcessor('input').pressButtonStart(name);
  };

  const handleButtonPressOut = name => {
    setTimeout(() => {
      webrtcClient.getChannelProcessor('input').pressButtonEnd(name);
    }, 50);
  };

  const handleStickMove = (id, data) => {
    // console.log('handleStickMove:', id, data);
    const leveledX = data.dist.x.toFixed(2);
    const leveledY = data.dist.y.toFixed(2);
    if (id === 'right') {
      webrtcClient
        .getChannelProcessor('input')
        .moveRightStick(Number(leveledX), Number(leveledY));
    } else {
      webrtcClient
        .getChannelProcessor('input')
        .moveLeftStick(Number(leveledX), Number(leveledY));
    }
  };

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    const sweap = obj => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [value, key]),
      );
    };

    let gpMaping = sweap(defaultMaping);
    if (_settings.native_gamepad_maping) {
      gpMaping = sweap(_settings.native_gamepad_maping);
    }

    FullScreenManager.immersiveModeOn();

    setTimeout(() => {
      Orientation.lockToLandscape();
    }, 500);

    let gpDownEventListener;
    let gpUpEventListener;
    let dpDownEventListener;
    let dpUpEventListener;
    let leftStickEventListener;
    let rightStickEventListener;
    let triggerEventListener;
    let timer;

    if (!streamApi) {
      if (route.params?.streamType === 'cloud') {
        if (streamingTokens.xCloudToken) {
          const _xCloudApi = new XcloudApi(
            streamingTokens.xCloudToken.getDefaultRegion().baseUri,
            streamingTokens.xCloudToken.data.gsToken,
            'cloud',
            authentication,
          );
          setStreamApi(_xCloudApi);
        }
      } else {
        if (streamingTokens.xHomeToken) {
          const _xHomeApi = new XcloudApi(
            streamingTokens.xHomeToken.getDefaultRegion().baseUri,
            streamingTokens.xHomeToken.data.gsToken,
            'home',
            authentication,
          );
          setStreamApi(_xHomeApi);
        }
      }
    }

    if (streamApi && webrtcClient === undefined) {
      setWebrtcClient(new webRTCClient());
    }

    if (streamApi && webrtcClient !== undefined) {
      webrtcClient.init();

      remoteStream.current = new MediaStream(undefined);

      webrtcClient.setTrackHandler(event => {
        const track = event.track;
        if (!remoteStream.current) {
          remoteStream.current = new MediaStream();
        }
        remoteStream.current.addTrack(track, remoteStream.current);
      });

      webrtcClient.setConnectedHandler(() => {
        // Connected
        setLoadingText(`${t('Connected')}`);
        setLoading(false);
        setShowVirtualGamepad(true);
        setRemote(remoteStream.current.toURL());

        setInterval(() => {
          webrtcClient.getChannelProcessor('input').addProcessedFrame({
            serverDataKey: new Date().getTime(),
            firstFramePacketArrivalTimeMs: 9954.2,
            frameSubmittedTimeMs: 9954.2,
            frameDecodedTimeMs: 10033,
            frameRenderedTimeMs: 10033,
          });
        }, 5000);

        // Start keepalive loop
        keepaliveInterval.current = setInterval(() => {
          streamApi
            .sendKeepalive()
            .then(result => {
              log.info('StartStream keepalive:', JSON.stringify(result));
            })
            .catch(error => {
              log.error(
                'Failed to send keepalive. Error details:\n',
                JSON.stringify(error),
              );
            });
        }, 20 * 1000);
      });

      const eventEmitter = new NativeEventEmitter();

      gpDownEventListener = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          const keyCode = event.keyCode;
          gpState[gpMaping[keyCode]] = 1;
        },
      );

      gpUpEventListener = eventEmitter.addListener('onGamepadKeyUp', event => {
        const keyCode = event.keyCode;
        gpState[gpMaping[keyCode]] = 0;
      });

      dpDownEventListener = eventEmitter.addListener('onDpadKeyDown', event => {
        const keyCode = event.dpadIdx;
        gpState[gpMaping[keyCode]] = 1;
      });

      dpUpEventListener = eventEmitter.addListener('onDpadKeyUp', event => {
        const _gpMaping = _settings.native_gamepad_maping ?? defaultMaping;
        gpState[gpMaping[_gpMaping.DPadUp]] = 0;
        gpState[gpMaping[_gpMaping.DPadDown]] = 0;
        gpState[gpMaping[_gpMaping.DPadLeft]] = 0;
        gpState[gpMaping[_gpMaping.DPadRight]] = 0;
      });

      leftStickEventListener = eventEmitter.addListener(
        'onLeftStickMove',
        event => {
          gpState.LeftThumbXAxis = event.axisX;
          gpState.LeftThumbYAxis = event.axisY;
        },
      );

      rightStickEventListener = eventEmitter.addListener(
        'onRightStickMove',
        event => {
          gpState.RightThumbXAxis = event.axisX;
          gpState.RightThumbYAxis = event.axisY;
        },
      );

      triggerEventListener = eventEmitter.addListener('onTrigger', event => {
        gpState.LeftTrigger = event.leftTrigger;
        gpState.RightTrigger = event.rightTrigger;
      });

      timer = setInterval(() => {
        webrtcClient.setGamepadState(gpState);
      }, 1000 / 120);

      setLoadingText(`${t('Connecting...')}`);
      console.log('Connecting...');

      streamApi
        .startSession(route.params?.sessionId, _settings.resolution)
        .then(configuration => {
          setLoadingText(
            `${t('Configuration obtained successfully, initiating offer...')}`,
          );
          webrtcClient.createOffer().then(offer => {
            streamApi.sendSDPOffer(offer).then(sdpResponse => {
              setLoadingText(`${t('Remote offer retrieved successfully...')}`);
              log.info('sdpResponse.exchangeResponse:', sdpResponse);
              const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);
              webrtcClient.setRemoteOffer(sdpDetails.sdp).then(() => {
                setLoadingText(`${t('Ready to send ICE...')}`);
                const iceCandidates = webrtcClient.getIceCandidates();
                streamApi.sendICECandidates(iceCandidates).then(iceDetails => {
                  log.info(
                    'Client - ICE iceDetails:',
                    JSON.stringify(iceDetails),
                  );
                  webrtcClient.setIceCandidates(iceDetails);
                  setLoadingText(`${t('Exchange ICE successfully...')}`);
                });
              });
            });
          });
        });

      // setTimeout(() => {
      //   const postData = {
      //     type: 'offer',
      //   };
      //   webviewRef.current.injectJavaScript(
      //     generateOnMessageFunction(postData),
      //   );
      // }, 5000);
    }

    return () => {
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();

      if (webrtcClient) {
        webrtcClient.close();
      }
      gpDownEventListener && gpDownEventListener.remove();
      gpUpEventListener && gpUpEventListener.remove();
      dpDownEventListener && dpDownEventListener.remove();
      dpUpEventListener && dpUpEventListener.remove();
      leftStickEventListener && leftStickEventListener.remove();
      rightStickEventListener && rightStickEventListener.remove();
      triggerEventListener && triggerEventListener.remove();
      timer && clearInterval(timer);
      if (keepaliveInterval.current) {
        clearInterval(keepaliveInterval.current);
      }
    };
  }, [
    t,
    route.params?.sessionId,
    route.params?.streamType,
    webrtcClient,
    streamingTokens,
    navigation,
    authentication,
    streamApi,
  ]);

  const uri = 'file:///android_asset/test.html';

  const webviewRef = React.useRef(null);

  const generateOnMessageFunction = data =>
    `(function() {
          document.dispatchEvent(new MessageEvent('message', {data: ${JSON.stringify(
            data,
          )}}));
        })()`;

  const handleWebviewMessage = event => {
    const data = JSON.parse(event.nativeEvent.data);
    const {type, message} = data;

    const webviewOffer = message;
    console.log('webview offer:', webviewOffer);

    webrtcClient.createOffer2().then(localOffer => {
      console.log('localOffer:', localOffer);
      const lines = localOffer.sdp.split('\n');
      let fingerprint = '';
      let video = '';
      let audio = '';
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('a=fingerprint') > -1) {
          fingerprint = lines[i];
        }
        if (lines[i].indexOf('m=video') > -1) {
          video = lines[i];
        }
        if (lines[i].indexOf('m=audio') > -1) {
          audio = lines[i];
        }
      }

      const webviewLines = webviewOffer.sdp.split('\n');
      for (let i = 0; i < webviewLines.length; i++) {
        if (webviewLines[i].indexOf('a=fingerprint') > -1) {
          webviewLines[i] = fingerprint;
        }
        if (webviewLines[i].indexOf('m=video') > -1) {
          webviewLines[i] = video;
        }
        if (webviewLines[i].indexOf('m=audio') > -1) {
          webviewLines[i] = audio;
        }
      }

      let newWebviewOffer = {
        type: 'offer',
        sdp: webviewLines.join('\n'),
      };

      console.log('newWebviewOffer:', newWebviewOffer);

      // FIXME: SessionDescription is NULL
      webrtcClient.setLocalDescription(newWebviewOffer);
    });
  };

  return (
    <View style={styles.container}>
      <Spinner
        visible={loading}
        color={'#107C10'}
        textContent={loadingText}
        textStyle={styles.spinnerTextStyle}
      />
      {remoteStream.current?.toURL() && (
        <RTCView
          style={styles.player}
          zOrder={9}
          objectFit={'contain'}
          streamURL={remote}
        />
      )}
      {showVirtualGamepad && (
        <VirtualGamepad
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onStickMove={handleStickMove}
        />
      )}

      {/* <WebView
        ref={instance => {
          webviewRef.current = instance;
        }}
        source={{uri}}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        cacheEnabled={false}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        onMessage={event => {
          handleWebviewMessage(event);
        }}
      /> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  player: {
    flex: 1,
    width: '100%',
  },
  spinnerTextStyle: {
    color: '#107C10',
  },
  performance: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  performanceText: {
    fontSize: 10,
    color: '#fff',
  },
});

export default NativeStreamScreen;
