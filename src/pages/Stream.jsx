import React from 'react';
import {
  Alert,
  NativeModules,
  Vibration,
  NativeEventEmitter,
  StyleSheet,
} from 'react-native';
import {Modal, Card, Menu, MenuItem} from '@ui-kitten/components';
import {WebView} from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';
import XcloudApi from '../xCloud';
import {useSelector} from 'react-redux';
import {getSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';
import VirtualGamepad from '../components/VirtualGamepad';

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
  const [showModal, setShowModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [showPerformance, setShowPerformance] = React.useState(false);

  const gpDownEventListener = React.useRef(undefined);
  const gpUpEventListener = React.useRef(undefined);
  const dpDownEventListener = React.useRef(undefined);
  const dpUpEventListener = React.useRef(undefined);
  const leftStickEventListener = React.useRef(undefined);
  const rightStickEventListener = React.useRef(undefined);
  const triggerEventListener = React.useRef(undefined);
  const timer = React.useRef(undefined);

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

    if (_settings.gamepad_kernal === 'Native') {
      const eventEmitter = new NativeEventEmitter();

      gpDownEventListener.current = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          console.log('onGamepadKeyDown:', event);
          const keyCode = event.keyCode;
          gpState[gpMaping[keyCode]] = 1;
        },
      );

      gpUpEventListener.current = eventEmitter.addListener(
        'onGamepadKeyUp',
        event => {
          const keyCode = event.keyCode;
          setTimeout(() => {
            gpState[gpMaping[keyCode]] = 0;
          }, 16);
        },
      );

      dpDownEventListener.current = eventEmitter.addListener(
        'onDpadKeyDown',
        event => {
          const keyCode = event.dpadIdx;
          gpState[gpMaping[keyCode]] = 1;
        },
      );

      dpUpEventListener.current = eventEmitter.addListener(
        'onDpadKeyUp',
        event => {
          const _gpMaping = _settings.native_gamepad_maping ?? defaultMaping;
          gpState[gpMaping[_gpMaping.DPadUp]] = 0;
          gpState[gpMaping[_gpMaping.DPadDown]] = 0;
          gpState[gpMaping[_gpMaping.DPadLeft]] = 0;
          gpState[gpMaping[_gpMaping.DPadRight]] = 0;
        },
      );

      leftStickEventListener.current = eventEmitter.addListener(
        'onLeftStickMove',
        event => {
          console.log('onLeftStickMove:', event);
          gpState.LeftThumbXAxis = event.axisX;
          gpState.LeftThumbYAxis = event.axisY;
        },
      );

      rightStickEventListener.current = eventEmitter.addListener(
        'onRightStickMove',
        event => {
          gpState.RightThumbXAxis = event.axisX;
          gpState.RightThumbYAxis = event.axisY;
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          if (event.leftTrigger >= 0.5) {
            gpState.LeftTrigger = 1;
          } else {
            gpState.LeftTrigger = event.leftTrigger;
          }

          if (event.RightTrigger >= 0.5) {
            gpState.RightTrigger = 1;
          } else {
            gpState.RightTrigger = event.RightTrigger;
          }
        },
      );

      timer.current = setInterval(() => {
        postData2Webview('gamepad', gpState);
      }, 4);
    }

    navigation.addListener('beforeRemove', e => {
      if (e.data.action.type !== 'GO_BACK') {
        navigation.dispatch(e.data.action);
      } else {
        e.preventDefault();

        // Show confirm modal
        setShowModal(true);
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
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();
      gpDownEventListener.current && gpDownEventListener.current.remove();
      gpUpEventListener.current && gpUpEventListener.current.remove();
      dpDownEventListener.current && dpDownEventListener.current.remove();
      dpUpEventListener.current && dpUpEventListener.current.remove();
      leftStickEventListener.current && leftStickEventListener.current.remove();
      rightStickEventListener.current &&
        rightStickEventListener.current.remove();
      triggerEventListener.current && triggerEventListener.current.remove();
      timer.current && clearInterval(timer.current);
    };
  }, [
    route.params?.sessionId,
    route.params?.streamType,
    streamingTokens,
    navigation,
    authentication,
  ]);

  const streamApi = route.params?.streamType === 'cloud' ? xCloudApi : xHomeApi;

  const uri = 'file:///android_asset/stream/index.html';

  const webviewRef = React.useRef(null);

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

  const postData2Webview = (type, value) => {
    webviewRef.current &&
      webviewRef.current.postMessage(JSON.stringify({type, value}));
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
          postData2Webview('startSessionEnd', configuration);
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
          postData2Webview('sendSDPOfferEnd', sdpDetails);
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
          postData2Webview('sendIceEnd', candidates);
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

  // Virtual gamepad press
  const handleButtonPressIn = name => {
    gpState[name] = 1;
    Vibration.vibrate(30);
  };

  const handleButtonPressOut = name => {
    setTimeout(() => {
      gpState[name] = 0;
    }, 50);
  };

  // Virtual gamepad move joystick
  const handleStickMove = (id, data) => {
    // console.log('handleStickMove:', id, data);
    let leveledX = data.dist.x;
    let leveledY = data.dist.y;

    if (typeof leveledX === 'string') {
      leveledX = leveledX.toFixed(2);
    }
    if (typeof leveledY === 'string') {
      leveledX = leveledY.toFixed(2);
    }

    if (id === 'right') {
      gpState.RightThumbXAxis = Number(leveledX);
      gpState.RightThumbYAxis = Number(-leveledY);
    } else {
      gpState.LeftThumbXAxis = Number(leveledX);
      gpState.LeftThumbYAxis = Number(-leveledY);
    }
  };

  const requestVirtualGamepad = () => {
    // Close
    if (showVirtualGamepad) {
      setShowVirtualGamepad(false);
      if (settings.gamepad_kernal !== 'Native') {
        timer.current && clearInterval(timer.current);
      }
    } else {
      setShowVirtualGamepad(true);
      if (settings.gamepad_kernal !== 'Native') {
        timer.current = setInterval(() => {
          postData2Webview('gamepad', gpState);
        }, 4);
      }
    }
  };

  const requestExit = () => {
    setShowPerformance(false);
    setShowVirtualGamepad(false);
    postData2Webview('disconnect', {});
    setShowModal(false);
  };

  return (
    <>
      {showVirtualGamepad && (
        <VirtualGamepad
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onStickMove={handleStickMove}
        />
      )}

      <Modal
        visible={showModal}
        backdropStyle={styles.backdrop}
        onBackdropPress={() => setShowModal(false)}>
        <Card disabled={true} style={styles.card}>
          <Menu>
            <MenuItem title={t('Toggle Performance')} />
            <MenuItem
              title={t('Toggle Virtual Gamepad')}
              onPress={() => {
                requestVirtualGamepad();
                setShowModal(false);
              }}
            />
            <MenuItem title={t('Disconnect')} onPress={requestExit} />
            <MenuItem title={t('Cancel')} onPress={() => setShowModal(false)} />
          </Menu>
        </Card>
      </Modal>
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

const styles = StyleSheet.create({
  card: {
    width: 300,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  title: {
    paddingBottom: 10,
  },
  content: {
    paddingTop: 10,
  },
});

export default StreamScreen;
