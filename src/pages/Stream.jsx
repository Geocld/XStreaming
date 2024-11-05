import React from 'react';
import {
  View,
  Alert,
  NativeModules,
  Vibration,
  NativeEventEmitter,
  StyleSheet,
} from 'react-native';
import {Portal, Modal, Card, List} from 'react-native-paper';
import {WebView} from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';
import RNRestart from 'react-native-restart';
import XcloudApi from '../xCloud';
import {useSelector} from 'react-redux';
import {getSettings, saveSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';
import WebApi from '../web';
import {GAMEPAD_MAPING as USB_GAMEPAD_MAPING} from '../common/usbGamepadMaping';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import PerfPanel from '../components/PerfPanel';
import Display from '../components/Display';

const log = debugFactory('StreamScreen');

const CONNECTED = 'connected';

const {FullScreenManager, GamepadManager, UsbRumbleManager} = NativeModules;

let defaultMaping = GAMEPAD_MAPING;

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

const keyDownTimestamp = {};

const BUTTON_CLICK_THRESHOLD = 4;

function StreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const streamingTokens = useSelector(state => state.streamingTokens);
  const webToken = useSelector(state => state.webToken);

  const [xHomeApi, setXHomeApi] = React.useState(null);
  const [xCloudApi, setXCloudApi] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [isExiting, setIsExiting] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showDisplayModal, setShowDisplayModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [connectState, setConnectState] = React.useState('');
  const [performance, setPerformance] = React.useState({});
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [needPoweroff, setNeedPoweroff] = React.useState(false);

  const gpDownEventListener = React.useRef(undefined);
  const gpUpEventListener = React.useRef(undefined);
  const dpDownEventListener = React.useRef(undefined);
  const dpUpEventListener = React.useRef(undefined);
  const leftStickEventListener = React.useRef(undefined);
  const rightStickEventListener = React.useRef(undefined);
  const triggerEventListener = React.useRef(undefined);
  const timer = React.useRef(undefined);
  const isLeftTriggerCanClick = React.useRef(false);
  const isRightTriggerCanClick = React.useRef(false);
  const isRumbling = React.useRef(false);

  const usbGpEventListener = React.useRef(undefined);

  React.useEffect(() => {
    GamepadManager.setCurrentScreen('stream');
    const isUsbMode = route.params?.isUsbMode || false;

    const _settings = getSettings();
    setSettings(_settings);

    console.log('isUsbMode:', isUsbMode);

    const sweap = obj => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [value, key]),
      );
    };

    if (isUsbMode) {
      defaultMaping = USB_GAMEPAD_MAPING;
      // console.log('defaultMaping:', defaultMaping);
    }
    let gpMaping = sweap(defaultMaping);
    if (!isUsbMode && _settings.native_gamepad_maping) {
      gpMaping = sweap(_settings.native_gamepad_maping);
    }

    const normaliseAxis = value => {
      if (_settings.dead_zone) {
        if (Math.abs(value) < _settings.dead_zone) {
          return 0;
        }

        value = value - Math.sign(value) * _settings.dead_zone;
        value /= 1.0 - _settings.dead_zone;

        // Joystick edge compensation
        const THRESHOLD = 0.8;
        const MAX_VALUE = 1;
        const compensation = _settings.edge_compensation / 100 || 0;
        if (Math.abs(value) > THRESHOLD) {
          if (value > 0) {
            value = Math.min(value + compensation, MAX_VALUE);
          } else {
            value = Math.max(value - compensation, -MAX_VALUE);
          }
        }
        return value;
      } else {
        return value;
      }
    };

    FullScreenManager.immersiveModeOn();

    const stopVibrate = () => {
      GamepadManager.vibrate(10, 0, 0, 0, 0);
    };

    const resetButtonState = () => {
      const keys = [
        'A',
        'B',
        'X',
        'Y',
        'LeftShoulder',
        'RightShoulder',
        'View',
        'Menu',
        'LeftThumb',
        'RightThumb',
        'DPadUp',
        'DPadDown',
        'DPadLeft',
        'DPadRight',
        'Nexus',
      ];
      keys.forEach(k => {
        gpState[k] = 0;
      });
    };

    // USB Mode
    if (isUsbMode) {
      log.info('Entry usb mode');
      const eventEmitter = new NativeEventEmitter();
      usbGpEventListener.current = eventEmitter.addListener(
        'onGamepadReport',
        params => {
          const {
            keyCode,
            leftTrigger,
            rightTrigger,
            leftStickX,
            leftStickY,
            rightStickX,
            rightStickY,
          } = params;

          // console.log('gpMaping:', gpMaping);
          // Button
          if (keyCode !== 1024 && keyCode !== 0) {
            if (gpMaping[keyCode]) {
              const keyName = gpMaping[keyCode];
              gpState[keyName] = 1;
            }
          } else {
            resetButtonState();
          }

          // Trigger
          gpState.LeftTrigger = leftTrigger;
          gpState.RightTrigger = rightTrigger;

          // Joystick
          gpState.LeftThumbXAxis = normaliseAxis(leftStickX);
          gpState.LeftThumbYAxis = normaliseAxis(leftStickY);
          gpState.RightThumbXAxis = normaliseAxis(rightStickX);
          gpState.RightThumbYAxis = normaliseAxis(rightStickY);
        },
      );

      timer.current = setInterval(() => {
        postData2Webview('gamepad', gpState);
      }, 16);
    } else if (_settings.gamepad_kernal === 'Native') {
      log.info('Entry native mode');
      const eventEmitter = new NativeEventEmitter();

      gpDownEventListener.current = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          // console.log('onGamepadKeyDown:', event);
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];
          gpState[keyName] = 1;

          keyDownTimestamp[keyName] = Date.now();

          // If LeftTrigger or RightTrigger is a button, onTrigger event should not be processed.
          if (keyName === 'LeftTrigger') {
            isLeftTriggerCanClick.current = true;
          }
          if (keyName === 'RightTrigger') {
            isRightTriggerCanClick.current = true;
          }
        },
      );

      gpUpEventListener.current = eventEmitter.addListener(
        'onGamepadKeyUp',
        event => {
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];

          const keyUpTimestamp = Date.now();
          const timeDiff = keyUpTimestamp - (keyDownTimestamp[keyName] || 0);
          // console.log('timeDiff:', timeDiff);

          // if (timeDiff < BUTTON_CLICK_THRESHOLD) {
          //   return;
          // }
          // console.log('onGamepadKeyUp:', event);

          if (keyName === 'LeftTrigger') {
            isLeftTriggerCanClick.current = true;
          }
          if (keyName === 'RightTrigger') {
            isRightTriggerCanClick.current = true;
          }

          gpState[keyName] = 0;
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
          // console.log('onLeftStickMove:', event);
          gpState.LeftThumbXAxis = normaliseAxis(event.axisX);
          gpState.LeftThumbYAxis = normaliseAxis(event.axisY);
        },
      );

      rightStickEventListener.current = eventEmitter.addListener(
        'onRightStickMove',
        event => {
          gpState.RightThumbXAxis = normaliseAxis(event.axisX);
          gpState.RightThumbYAxis = normaliseAxis(event.axisY);
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          if (!isLeftTriggerCanClick.current) {
            if (event.leftTrigger >= 0.5) {
              gpState.LeftTrigger = 1;
            } else {
              setTimeout(() => {
                gpState.LeftTrigger = 0;
              }, 16);
            }
          }

          if (!isRightTriggerCanClick.current) {
            if (event.rightTrigger >= 0.5) {
              gpState.RightTrigger = 1;
            } else {
              setTimeout(() => {
                gpState.RightTrigger = 0;
              }, 16);
            }
          }
        },
      );

      timer.current = setInterval(() => {
        postData2Webview('gamepad', gpState);
      }, 4);
    }

    navigation.addListener('beforeRemove', e => {
      stopVibrate();
      if (e.data.action.type !== 'GO_BACK') {
        navigation.dispatch(e.data.action);
      } else {
        e.preventDefault();

        // Show confirm modal
        setShowModal(true);
        GamepadManager.setCurrentScreen('');
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
      stopVibrate();
      usbGpEventListener.current && usbGpEventListener.current.remove();
      gpDownEventListener.current && gpDownEventListener.current.remove();
      gpUpEventListener.current && gpUpEventListener.current.remove();
      dpDownEventListener.current && dpDownEventListener.current.remove();
      dpUpEventListener.current && dpUpEventListener.current.remove();
      leftStickEventListener.current && leftStickEventListener.current.remove();
      rightStickEventListener.current &&
        rightStickEventListener.current.remove();
      triggerEventListener.current && triggerEventListener.current.remove();
      timer.current && clearInterval(timer.current);
      GamepadManager.setCurrentScreen('');
    };
  }, [
    route.params?.sessionId,
    route.params?.streamType,
    route.params?.isUsbMode,
    streamingTokens,
    navigation,
    authentication,
  ]);

  const streamApi = route.params?.streamType === 'cloud' ? xCloudApi : xHomeApi;

  const uri = 'file:///android_asset/stream/index.html';

  const webviewRef = React.useRef(null);

  const handlePowerOff = async () => {
    const webApi = new WebApi(webToken);
    const powerOffRes = await webApi.powerOff(route.params?.sessionId);
    console.log('powerOff:', powerOffRes);
  };

  const handleExit = () => {
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    streamApi.stopStream().then(() => {
      if (needPoweroff) {
        handlePowerOff();
      }
      setTimeout(() => {
        setIsExiting(false);
        Orientation.unlockAllOrientations();
        FullScreenManager.immersiveModeOff();
        navigation.navigate({
          name: 'Home',
          params: {needRefresh: true},
        });
      }, 500);
    });
  };

  const handleTimeoutExit = () => {
    streamApi.stopStream().then(() => {
      authentication._tokenStore &&
        authentication._tokenStore.clearTokenUpdateTime();
      setTimeout(() => {
        RNRestart.restart();
      }, 100);
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    GamepadManager.setCurrentScreen('stream');
    if (settings.gamepad_kernal === 'Web') {
      webviewRef.current && webviewRef.current.requestFocus();
    }
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
            let msg = '';
            if (typeof e === 'string') {
              if (e.includes('WaitingForServerToRegister')) {
                msg =
                  '[StartSession] Fail:' + t('WaitingForServerToRegister') + e;
              }
            } else {
              msg = '[StartSession] Fail:' + e;
            }
            Alert.alert(t('Warning'), msg, [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  if (isExiting) {
                    return;
                  }
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
      const {rumbleData} = message;
      if (rumbleData.strongMagnitude === 0 || rumbleData.weakMagnitude === 0) {
        Vibration.cancel();
      } else {
        Vibration.vibrate(rumbleData.duration / 10);
      }
    }
    if (type === 'nativeVibration') {
      const {rumbleData} = message;
      console.log('rumbleData:', rumbleData);

      const isUsbMode = route.params?.isUsbMode || false;
      if (isUsbMode) {
        console.log('isUsbMode:', isUsbMode);
        let weakMagnitude = rumbleData.weakMagnitude * 32767;
        let strongMagnitude = rumbleData.strongMagnitude * 32767;
        let leftTrigger = rumbleData.leftTrigger * 32767;
        let rightTrigger = rumbleData.rightTrigger * 32767;
        if (weakMagnitude > 32767) {
          weakMagnitude = 32767;
        }
        if (strongMagnitude > 32767) {
          strongMagnitude = 32767;
        }
        if (leftTrigger > 32767) {
          leftTrigger = 32767;
        }
        if (rightTrigger > 32767) {
          rightTrigger = 32767;
        }
        if (weakMagnitude > 0 || strongMagnitude > 0) {
          if (leftTrigger > 0 || rightTrigger > 0) {
            UsbRumbleManager.rumbleTriggers(leftTrigger, rightTrigger);
          } else {
            UsbRumbleManager.rumbleTriggers(0, 0);
          }
        } else {
          UsbRumbleManager.rumbleTriggers(0, 0);
        }
        UsbRumbleManager.rumble(weakMagnitude, strongMagnitude);
      } else {
        let weakMagnitude = rumbleData.weakMagnitude * 100;
        let strongMagnitude = rumbleData.strongMagnitude * 100;
        let leftTrigger = rumbleData.leftTrigger * 100;
        let rightTrigger = rumbleData.rightTrigger * 100;
        if (weakMagnitude > 100) {
          weakMagnitude = 100;
        }
        if (strongMagnitude > 100) {
          strongMagnitude = 100;
        }
        GamepadManager.vibrate(
          60000,
          weakMagnitude,
          strongMagnitude,
          leftTrigger,
          rightTrigger,
        );
      }
    }
    if (type === 'performance') {
      const oldPerf = performance;
      const perf = message;

      if (oldPerf) {
        if (!perf.br && oldPerf.br) {
          perf.br = oldPerf.br;
        }
        if (!perf.decode && oldPerf.decode) {
          perf.decode = oldPerf.decode;
        }
      }
      setPerformance(perf);
    }
    if (type === 'connectionstate') {
      setConnectState(message);
      // Alway show virtual gamepad
      if (message === CONNECTED && settings.show_virtual_gamead) {
        setShowVirtualGamepad(true);
      }

      // Alway show performance
      if (message === CONNECTED && settings.show_performance) {
        setShowPerformance(true);

        if (settings.gamepad_kernal === 'Web') {
          handleToggleWebviewPerformance();
        }
      }
    }
    if (type === 'exit') {
      handleExit();
    }
    if (type === 'timeoutExit') {
      /* Timeout, almost is connectionstate is failed,
         this situation we should refresh all tokens to make new connection.
       */
      handleTimeoutExit();
    }
  };

  const handleToggleWebviewPerformance = () => {
    if (showPerformance) {
      postData2Webview('showPerformance', {});
    } else {
      postData2Webview('hidePerformance', {});
    }
  };

  // Virtual gamepad press
  const handleButtonPressIn = name => {
    // console.log('handleButtonPressIn:', name);
    gpState[name] = 1;
    if (settings.vibration) {
      Vibration.vibrate(30);
    }
  };

  const handleButtonPressOut = name => {
    setTimeout(() => {
      // console.log('handleButtonPressOut:', name);
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

  const background = {
    borderless: false,
    color: 'rgba(255, 255, 255, 0.2)',
    foreground: true,
  };

  const handleDisplayOptionsChange = React.useCallback(
    options => {
      postData2Webview('refreshVideo', options);
      settings.display_options = options;
      // setSettings(settings);
      saveSettings(settings);
    },
    [settings],
  );

  const renderVirtualGamepad = () => {
    if (!showVirtualGamepad) {
      return null;
    }
    const useCustomVirtualGamepad = settings.custom_virtual_gamepad !== '';
    if (useCustomVirtualGamepad) {
      return (
        <CustomVirtualGamepad
          title={settings.custom_virtual_gamepad}
          opacity={settings.virtual_gamepad_opacity}
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onStickMove={handleStickMove}
        />
      );
    } else {
      return (
        <VirtualGamepad
          opacity={settings.virtual_gamepad_opacity}
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          onStickMove={handleStickMove}
        />
      );
    }
  };

  return (
    <>
      {showPerformance && settings.gamepad_kernal === 'Native' && (
        <PerfPanel performance={performance} />
      )}

      {renderVirtualGamepad()}

      <Portal>
        <Modal
          visible={showDisplayModal}
          onDismiss={() => {
            setShowDisplayModal(false);
          }}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <Display
                options={settings.display_options}
                onChange={handleDisplayOptionsChange}
              />
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={showModal}
          onDismiss={() => handleCloseModal()}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <List.Section>
                {connectState === CONNECTED && (
                  <List.Item
                    title={t('Toggle Performance')}
                    background={background}
                    onPress={() => {
                      if (settings.gamepad_kernal === 'Web') {
                        setShowPerformance(!showPerformance);
                        setTimeout(() => {
                          handleToggleWebviewPerformance();
                          webviewRef.current &&
                            webviewRef.current.requestFocus();
                        }, 10);
                      } else {
                        setShowPerformance(!showPerformance);
                      }
                      handleCloseModal();
                    }}
                  />
                )}

                {connectState === CONNECTED &&
                  settings.gamepad_kernal === 'Native' && (
                    <List.Item
                      title={t('Toggle Virtual Gamepad')}
                      background={background}
                      onPress={() => {
                        requestVirtualGamepad();
                        handleCloseModal();
                      }}
                    />
                  )}

                {connectState === CONNECTED && (
                  <List.Item
                    title={t('Display settings')}
                    background={background}
                    onPress={() => {
                      setShowDisplayModal(true);
                      handleCloseModal();
                    }}
                  />
                )}

                {connectState === CONNECTED && (
                  <List.Item
                    title={t('Press Nexus')}
                    background={background}
                    onPress={() => {
                      gpState.Nexus = 1;
                      setTimeout(() => {
                        gpState.Nexus = 0;
                      }, 120);
                      handleCloseModal();
                    }}
                  />
                )}
                {connectState === CONNECTED &&
                  route.params?.streamType !== 'cloud' && (
                    <List.Item
                      title={t('Long press Nexus')}
                      background={background}
                      onPress={() => {
                        gpState.Nexus = 1;
                        setTimeout(() => {
                          gpState.Nexus = 0;
                        }, 1000);
                        handleCloseModal();
                      }}
                    />
                  )}
                {connectState === CONNECTED &&
                  settings.power_on &&
                  route.params?.streamType !== 'cloud' && (
                    <List.Item
                      title={t('Disconnect and power off')}
                      background={background}
                      onPress={() => {
                        setNeedPoweroff(true);
                        requestExit();
                      }}
                    />
                  )}

                <List.Item
                  title={t('Disconnect')}
                  background={background}
                  onPress={requestExit}
                />
                <List.Item
                  title={t('Cancel')}
                  background={background}
                  onPress={() => handleCloseModal()}
                />
              </List.Section>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <View style={{flex: 1}} renderToHardwareTextureAndroid={true}>
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
          androidLayerType={'hardware'}
          injectedJavaScriptObject={{
            settings,
            streamType: route.params?.streamType,
          }}
          onMessage={event => {
            handleWebviewMessage(event);
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    padding: 5,
  },
  modal: {
    // backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginLeft: '32%',
    marginRight: '32%',
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
  phantom: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0,
    zIndex: -1,
  },
});

export default StreamScreen;
