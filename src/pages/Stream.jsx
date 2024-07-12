import React from 'react';
import {
  Alert,
  NativeModules,
  Vibration,
  NativeEventEmitter,
} from 'react-native';
import {WebView} from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';
import XcloudApi from '../xCloud';
import {useSelector} from 'react-redux';
import {getSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';

const log = debugFactory('StreamScreen');

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

function StreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const streamingTokens = useSelector(state => state.streamingTokens);

  const [xHomeApi, setXHomeApi] = React.useState(null);
  const [xCloudApi, setXCloudApi] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [isExiting, setIsExiting] = React.useState(false);

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

    let gpDownEventListener;
    let gpUpEventListener;
    let dpDownEventListener;
    let dpUpEventListener;
    let leftStickEventListener;
    let rightStickEventListener;
    let triggerEventListener;
    let timer;

    if (_settings.gamepad_kernal === 'Native') {
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
          console.log('onLeftStickMove:', event);
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
        const postData = {
          type: 'gamepad',
          message: {
            single: 'gpState',
            data: gpState,
          },
        };
        webviewRef.current &&
          webviewRef.current.injectJavaScript(
            generateOnMessageFunction(postData),
          );
      }, 1000 / 120);
    }

    navigation.addListener('beforeRemove', e => {
      if (e.data.action.type !== 'GO_BACK') {
        navigation.dispatch(e.data.action);
      } else {
        e.preventDefault();

        const postData = {
          type: 'action',
          message: {
            single: 'pageBack',
            data: '',
          },
        };
        webviewRef.current.injectJavaScript(
          generateOnMessageFunction(postData),
        );
      }
    });
    if (route.params?.sessionId) {
      log.info('Stream screen receive sessionId:', route.params?.sessionId);
    }
    if (route.params?.streamType) {
      log.info('Stream screen receive streamType:', route.params?.streamType);
    }
    if (streamingTokens.xHomeToken) {
      const _xHomeApi = new XcloudApi(
        streamingTokens.xHomeToken.getDefaultRegion().baseUri,
        streamingTokens.xHomeToken.data.gsToken,
        'home',
        authentication,
      );
      setXHomeApi(_xHomeApi);
    }
    if (streamingTokens.xCloudToken) {
      const _xCloudApi = new XcloudApi(
        streamingTokens.xCloudToken.getDefaultRegion().baseUri,
        streamingTokens.xCloudToken.data.gsToken,
        'cloud',
        authentication,
      );
      setXCloudApi(_xCloudApi);
    }

    setTimeout(() => {
      Orientation.lockToLandscape();

      console.log('gamepad_kernal:', _settings.gamepad_kernal);
      if (_settings.gamepad_kernal === 'Web') {
        webviewRef.current && webviewRef.current.requestFocus();
      }
      if (_settings.gamepad_kernal === 'Native') {
        // setFocusable(false);
        webviewRef.current && webviewRef.current.stopLoading();
      }
    }, 500);

    return () => {
      // 在组件卸载时解锁屏幕方向，恢复为默认状态
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();
      gpDownEventListener && gpDownEventListener.remove();
      gpUpEventListener && gpUpEventListener.remove();
      dpDownEventListener && dpDownEventListener.remove();
      dpUpEventListener && dpUpEventListener.remove();
      leftStickEventListener && leftStickEventListener.remove();
      rightStickEventListener && rightStickEventListener.remove();
      triggerEventListener && triggerEventListener.remove();
      timer && clearInterval(timer);
    };
  }, [
    route.params?.sessionId,
    route.params?.streamType,
    streamingTokens,
    navigation,
    authentication,
  ]);

  const streamApi = route.params?.streamType === 'cloud' ? xCloudApi : xHomeApi;

  // const uri = 'file:///android_asset/www/stream.html';
  const uri = 'file:///android_asset/stream/index.html';

  const webviewRef = React.useRef(null);

  const generateOnMessageFunction = data =>
    `(function() {
          document.dispatchEvent(new MessageEvent('message', {data: ${JSON.stringify(
            data,
          )}}));
        })()`;

  const handleExit = () => {
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    streamApi.stopStream().then(() => {
      setTimeout(() => {
        setIsExiting(false);
        Orientation.unlockAllOrientations();
        FullScreenManager.immersiveModeOff();
        // navigation.pop();
        navigation.navigate('Home');
      }, 500);
    });
  };

  const handleWebviewMessage = event => {
    const data = JSON.parse(event.nativeEvent.data);
    const {type, message} = data;
    if (type === 'other') {
      Alert.alert(message);
    }
    if (type === 'xcloudReady') {
      const _settings = getSettings();
      log.info('Get localSettings:', _settings);
      streamApi
        .startSession(route.params?.sessionId, _settings.resolution)
        .then(configuration => {
          // log.info('configuration:', configuration);
          const postData = {
            type: 'stream',
            message: {
              single: 'startSessionEnd',
              data: configuration,
            },
          };
          webviewRef.current.injectJavaScript(
            generateOnMessageFunction(postData),
          );
        })
        .catch(e => {
          if (e !== '') {
            const msg = '[StartSession] Fail:' + e;
            Alert.alert(t('Warning'), msg, [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  if (isExiting) {
                    return;
                  }
                  // navigation.pop();
                  navigation.navigate('Home');
                },
              },
            ]);
          }
        });
    }
    if (type === 'xcloudOfferReady') {
      // log.info('receive client offer:', message);
      // sendSdp
      streamApi
        .sendSDPOffer(message)
        .then(sdpResponse => {
          log.info('sdpResponse.exchangeResponse:', sdpResponse);
          const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);
          const postData = {
            type: 'stream',
            message: {
              single: 'sendSDPOfferEnd',
              data: sdpDetails,
            },
          };
          webviewRef.current.injectJavaScript(
            generateOnMessageFunction(postData),
          );
        })
        .catch(e => {
          Alert.alert(t('Warning'), '[sendSDPOffer] fail:' + e, [
            {
              text: t('Confirm'),
              style: 'default',
              onPress: () => {
                handleExit();
              },
            },
          ]);
        });
    }
    if (type === 'sendICEReady') {
      log.info('sendICEReady');
      // SendICE
      streamApi
        .sendICECandidates(message)
        .then(candidates => {
          log.info('Client - ICE Candidates:', JSON.stringify(candidates));

          const postData = {
            type: 'stream',
            message: {
              single: 'sendIceEnd',
              data: candidates,
            },
          };
          webviewRef.current.injectJavaScript(
            generateOnMessageFunction(postData),
          );
        })
        .catch(e => {
          Alert.alert(t('Warning'), '[sendICECandidates] fail:' + e, [
            {
              text: t('Confirm'),
              style: 'default',
              onPress: () => {
                handleExit();
              },
            },
          ]);
        });
    }
    if (type === 'sendKeepalive') {
      log.info('sendKeepalive');
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
    }
    if (type === 'streamingClosed') {
      Alert.alert(t('Warning'), 'Streaming is closed.', [
        {
          text: t('Confirm'),
          style: 'default',
          onPress: () => {
            handleExit();
          },
        },
      ]);
    }
    if (type === 'pressButton') {
      Vibration.vibrate(30);
    }
    if (type === 'deviceVibration') {
      const {rumbleData, repeat} = message;
      if (rumbleData.strongMagnitude === 0 || rumbleData.weakMagnitude === 0) {
        Vibration.cancel();
      } else {
        Vibration.vibrate(rumbleData.duration / 10);
      }
      // trigger('impactMedium', options);
    }
    if (type === 'nativeVibration') {
      const {rumbleData} = message;
      GamepadManager.vibrate(
        rumbleData.duration / 10,
        rumbleData.weakMagnitude * 100,
        rumbleData.strongMagnitude * 100,
        rumbleData.leftTrigger * 100,
        rumbleData.rightTrigger * 100,
      );
    }
    if (type === 'exit') {
      handleExit();
    }
  };

  return (
    <>
      <WebView
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
        injectedJavaScriptObject={{
          settings,
          streamType: route.params?.streamType,
        }}
        onMessage={event => {
          handleWebviewMessage(event);
        }}
      />
    </>
  );
}

export default StreamScreen;
