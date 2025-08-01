import React from 'react';
import {
  View,
  Alert,
  NativeModules,
  Vibration,
  NativeEventEmitter,
  StyleSheet,
  ScrollView,
  Dimensions,
  ToastAndroid,
} from 'react-native';
import {
  Portal,
  Modal,
  Card,
  List,
  Button,
  IconButton,
  TextInput,
} from 'react-native-paper';
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
import {XBOX_360_GAMEPAD_MAPING} from '../common/usbGamepadMaping';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import PerfPanel from '../components/PerfPanel';
import Display from '../components/Display';
import Audio from '../components/Audio';

const log = debugFactory('StreamScreen');

const CONNECTED = 'connected';
const DUALSENSE = 'DualSenseController';

const {
  FullScreenManager,
  GamepadManager,
  UsbRumbleManager,
  SensorModule,
  GamepadSensorModule,
} = NativeModules;

let defaultMaping = GAMEPAD_MAPING;
let triggerMax = 0.8;

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
  const webToken = useSelector(state => state.webToken);

  const [xHomeApi, setXHomeApi] = React.useState(null);
  const [xCloudApi, setXCloudApi] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [isExiting, setIsExiting] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showDisplayModal, setShowDisplayModal] = React.useState(false);
  const [showAudioModal, setShowAudioModal] = React.useState(false);
  const [showMessageModal, setShowMessageModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [connectState, setConnectState] = React.useState('');
  const [performance, setPerformance] = React.useState({});
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [needPoweroff, setNeedPoweroff] = React.useState(false);
  const [modalMaxHeight, setModalMaxHeight] = React.useState(250);
  const [message, setMessage] = React.useState('');
  const [messageSending, setMessageSending] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [openMicro, setOpenMicro] = React.useState(false);

  const gpDownEventListener = React.useRef(undefined);
  const gpUpEventListener = React.useRef(undefined);
  const dpDownEventListener = React.useRef(undefined);
  const dpUpEventListener = React.useRef(undefined);
  const stickEventListener = React.useRef(undefined);
  const triggerEventListener = React.useRef(undefined);
  const timer = React.useRef(undefined);
  const isTriggerMotion = React.useRef(false);
  const isRightstickMoving = React.useRef(false);

  const usbGpEventListener = React.useRef(undefined);
  const sensorEventListener = React.useRef(undefined);

  React.useEffect(() => {
    GamepadManager.setCurrentScreen('stream');
    const isUsbMode = route.params?.isUsbMode || false;
    const usbController = route.params?.usbController || 'Xbox360Controller';

    const _settings = getSettings();
    setSettings(_settings);

    const sweap = obj => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [value, key]),
      );
    };

    if (isUsbMode) {
      defaultMaping = XBOX_360_GAMEPAD_MAPING;
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
      GamepadManager.vibrate(10, 0, 0, 0, 0, 3);
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

    const getPressedButtons = combinedValue => {
      const pressedButtons = [];
      for (const [button, value] of Object.entries(XBOX_360_GAMEPAD_MAPING)) {
        // eslint-disable-next-line no-bitwise
        if ((combinedValue & value) === value) {
          pressedButtons.push(button);
        }
      }
      return pressedButtons;
    };

    const setGpState = combinedKeys => {
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
        if (combinedKeys.includes(k)) {
          gpState[k] = 1;
        } else {
          gpState[k] = 0;
        }
      });
    };

    const eventEmitter = new NativeEventEmitter();

    // USB Mode
    if (isUsbMode) {
      log.info('Entry usb mode');
      log.info('Usb controller: ' + usbController);
      if (usbController === DUALSENSE) {
        UsbRumbleManager.setDsController(
          16,
          124,
          16,
          0,
          0,
          0,
          0,
          0,
          _settings.left_trigger_type || 0,
          _settings.left_trigger_effects || [],
          _settings.right_trigger_type || 0,
          _settings.right_trigger_effects || [],
        );
      }
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
          // console.log('usb keyCode:', keyCode);
          // Button
          if (keyCode !== 0) {
            const keys = getPressedButtons(keyCode);
            setGpState(keys);
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
      }, 1000 / _settings.polling_rate);
    } else if (_settings.gamepad_kernal === 'Native') {
      log.info('Entry native mode');
      gpDownEventListener.current = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          // console.log('onGamepadKeyDown:', event);
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (!isTriggerMotion.current) {
              gpState[keyName] = 1;
            }
          } else {
            gpState[keyName] = 1;
          }
        },
      );

      gpUpEventListener.current = eventEmitter.addListener(
        'onGamepadKeyUp',
        event => {
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (!isTriggerMotion.current) {
              gpState[keyName] = 0;
            }
          } else {
            gpState[keyName] = 0;
          }
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

      stickEventListener.current = eventEmitter.addListener(
        'onStickMove',
        event => {
          // console.log('onStickMove:', event);
          gpState.LeftThumbXAxis = normaliseAxis(event.leftStickX);
          gpState.LeftThumbYAxis = normaliseAxis(event.leftStickY);

          if (
            Math.abs(event.rightStickX) > 0.1 ||
            Math.abs(event.rightStickY) > 0.1
          ) {
            isRightstickMoving.current = true;
          } else {
            isRightstickMoving.current = false;
          }

          gpState.RightThumbXAxis = normaliseAxis(event.rightStickX);
          gpState.RightThumbYAxis = normaliseAxis(event.rightStickY);
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          isTriggerMotion.current = true;
          // Short trigger
          if (_settings.short_trigger) {
            triggerMax = _settings.dead_zone;
            if (event.leftTrigger >= triggerMax) {
              gpState.LeftTrigger = 1;
            } else {
              setTimeout(() => {
                gpState.LeftTrigger = 0;
              }, 16);
            }
          } else {
            // Line trigger
            if (event.leftTrigger >= 0.05) {
              gpState.LeftTrigger = event.leftTrigger;
            } else {
              setTimeout(() => {
                gpState.LeftTrigger = 0;
              }, 16);
            }
          }

          // Short trigger
          if (_settings.short_trigger) {
            triggerMax = _settings.dead_zone;
            if (event.rightTrigger >= triggerMax) {
              gpState.RightTrigger = 1;
            } else {
              setTimeout(() => {
                gpState.RightTrigger = 0;
              }, 16);
            }
          } else {
            // Line trigger
            if (event.rightTrigger >= 0.05) {
              gpState.RightTrigger = event.rightTrigger;
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
      }, 1000 / _settings.polling_rate);
    }

    if (_settings.sensor) {
      const sensorManager =
        _settings.sensor === 2 ? GamepadSensorModule : SensorModule;

      sensorManager.startSensor(
        _settings.sensor_sensitivity_x,
        _settings.sensor_sensitivity_y,
      );

      sensorEventListener.current = eventEmitter.addListener(
        'SensorData',
        params => {
          const {x, y} = params;

          let stickX = x / 32767;
          let stickY = y / 32767;

          // gyroscope only work when Rightstick not moving
          if (!isRightstickMoving.current) {
            const scaleX =
              _settings.sensor_sensitivity_x > 10000
                ? _settings.sensor_sensitivity_x / 10000
                : 1;

            const scaleY =
              _settings.sensor_sensitivity_y > 10000
                ? _settings.sensor_sensitivity_y / 10000
                : 1;

            switch (_settings.sensor_invert) {
              case 1: // x
                stickX = -stickX;
                break;
              case 2: // y
                stickY = -stickY;
                break;
              case 3: // All
                stickX = -stickX;
                stickY = -stickY;
                break;
              default:
                break;
            }
            // gyroscope only work when LT button press
            if (_settings.sensor_type === 1) {
              if (gpState.LeftTrigger >= _settings.dead_zone) {
                gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
                gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
              } else {
                gpState.RightThumbXAxis = 0;
                gpState.RightThumbYAxis = 0;
              }
            } else if (_settings.sensor_type === 2) {
              // LB
              if (gpState.LeftShoulder > 0) {
                gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
                gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
              } else {
                gpState.RightThumbXAxis = 0;
                gpState.RightThumbYAxis = 0;
              }
            } else if (_settings.sensor_type === 3) {
              // LT/LB
              if (
                gpState.LeftTrigger >= _settings.dead_zone ||
                gpState.LeftShoulder > 0
              ) {
                gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
                gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
              } else {
                gpState.RightThumbXAxis = 0;
                gpState.RightThumbYAxis = 0;
              }
            } else if (_settings.sensor_type === 4) {
              // Global
              gpState.RightThumbXAxis = stickX.toFixed(3) * scaleX;
              gpState.RightThumbYAxis = stickY.toFixed(3) * scaleY;
            }
          }
        },
      );
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

      setTimeout(() => {
        const {height: dHeight} = Dimensions.get('window');
        setModalMaxHeight(dHeight - 50);

        // setTimeout(() => {
        //   setShowVirtualGamepad(true);
        // }, 1000);
      }, 100);

      // console.log('gamepad_kernal:', _settings.gamepad_kernal);
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
      stickEventListener.current && stickEventListener.current.remove();
      triggerEventListener.current && triggerEventListener.current.remove();
      sensorEventListener.current && sensorEventListener.current.remove();
      timer.current && clearInterval(timer.current);
      GamepadManager.setCurrentScreen('');
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
    };
  }, [
    route.params?.sessionId,
    route.params?.streamType,
    route.params?.isUsbMode,
    route.params?.usbController,
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

  const handleSendMessage = async () => {
    const webApi = new WebApi(webToken);
    setMessageSending(true);
    let text = message.trim();
    if (message > 100) {
      text = text.substring(0, 100);
    }
    try {
      await webApi.sendText(route.params?.sessionId, text);
      setMessage('');
      ToastAndroid.show(t('Sended'), ToastAndroid.SHORT);
    } catch (e) {}
    setMessageSending(false);
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
        const dest = route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
        navigation.navigate({
          name: dest,
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
                if (e.includes('disabled streaming')) {
                  msg = '[StartSession] Fail:' + t('DisabledStreamingErr') + e;
                } else {
                  msg =
                    '[StartSession] Fail:' +
                    t('WaitingForServerToRegister') +
                    e;
                }
              } else if (e.includes('xboxstreaminghelper.cpp')) {
                msg = '[StartSession] Fail:' + t('XboxstreaminghelperErr') + e;
              } else {
                msg = '[StartSession] Fail:' + e;
              }
            } else {
              if (e.message?.indexOf('400') > -1) {
                const error = t('noAllow');
                msg = '[StartSession] Fail:' + error;
              } else {
                msg = '[StartSession] Fail:' + e;
              }
            }
            Alert.alert(t('Warning'), msg, [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  if (isExiting) {
                    return;
                  }
                  const dest =
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
                  navigation.navigate(dest);
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

      const isUsbMode = route.params?.isUsbMode || false;
      if (isUsbMode) {
        // console.log('isUsbMode:', isUsbMode);
        if (route.params?.usbController === DUALSENSE) {
          let weakMagnitude = rumbleData.weakMagnitude * 255;
          let strongMagnitude = rumbleData.strongMagnitude * 255;
          if (weakMagnitude > 255) {
            weakMagnitude = 255;
          }
          if (strongMagnitude > 255) {
            strongMagnitude = 255;
          }
          UsbRumbleManager.setDsController(
            16,
            124,
            16,
            0,
            0,
            0,
            strongMagnitude, // left motor
            weakMagnitude, // right motor
            settings.left_trigger_type || 0,
            settings.left_trigger_effects || [],
            settings.right_trigger_type || 0,
            settings.right_trigger_effects || [],
          );
        } else {
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

          if (rumbleData.duration < 20) {
            setTimeout(() => {
              UsbRumbleManager.rumble(0, 0);
              UsbRumbleManager.rumbleTriggers(0, 0);
            }, 300);
          }
        }
      } else {
        // Native android rumble
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
          10000,
          weakMagnitude,
          strongMagnitude,
          leftTrigger,
          rightTrigger,
          settings.rumble_intensity || 3,
        );

        if (rumbleData.duration < 20) {
          setTimeout(() => {
            GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
          }, 300);
        }
      }
    }
    if (type === 'performance') {
      const oldPerf = performance;
      const perf = message;

      if (oldPerf) {
        if (
          (!perf.br || perf.br === '--') &&
          oldPerf.br &&
          oldPerf.br !== '--'
        ) {
          perf.br = oldPerf.br;
        }
        if (
          (!perf.decode || perf.decode === '--') &&
          oldPerf.decode &&
          oldPerf.decode !== '--'
        ) {
          perf.decode = oldPerf.decode;
        }
      }
      setPerformance(perf);
    }
    if (type === 'connectionstate') {
      // Toggle microphone
      if (
        connectState === CONNECTED &&
        (message === 'new' || message === 'connecting')
      ) {
        return;
      }
      setConnectState(message);
      if (message === CONNECTED) {
        ToastAndroid.show(t('Connected'), ToastAndroid.SHORT);
      }
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
    if (type === 'sendChatSdp') {
      streamApi.sendChatSdp(message).then(sdpResponse => {
        log.info('sendChatSdp.exchangeResponse:', sdpResponse);
        const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);
        postData2Webview('sendChatSdpEnd', sdpDetails);
      });
    }
  };

  const handleToggleWebviewPerformance = () => {
    if (!showPerformance) {
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
    let leveledX = data.x;
    let leveledY = -data.y;

    if (typeof leveledX === 'string') {
      leveledX = leveledX.toFixed(2);
    }
    if (typeof leveledY === 'string') {
      leveledX = leveledY.toFixed(2);
    }

    if (id === 'right') {
      if (Math.abs(leveledX) > 0 || Math.abs(leveledY) > 0) {
        isRightstickMoving.current = true;
      } else {
        isRightstickMoving.current = false;
      }
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
        }, 1000 / settings.polling_rate);
      }
    }
  };

  const requestExit = () => {
    setShowPerformance(false);
    setShowVirtualGamepad(false);
    postData2Webview('disconnect', {});
    setShowModal(false);
    if (settings.sensor) {
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
    }
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

  const handleAudioChange = React.useCallback(value => {
    postData2Webview('adjustVolume', value);
    setVolume(value);
  }, []);

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
          visible={showAudioModal}
          onDismiss={() => {
            setShowAudioModal(false);
          }}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <Audio value={volume} onChange={handleAudioChange} />
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={showMessageModal}
          onDismiss={() => {
            setShowMessageModal(false);
          }}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <TextInput
                label={t('Text')}
                value={message}
                onChangeText={text => setMessage(text)}
              />
              <Button
                mode="contained"
                loading={messageSending}
                style={{marginTop: 10}}
                onPress={handleSendMessage}>
                {t('Send')}
              </Button>
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
              <ScrollView style={{maxHeight: modalMaxHeight}}>
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
                          }, 100);
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

                  {connectState === CONNECTED &&
                    settings.enable_audio_control && (
                      <List.Item
                        title={t('Audio_volume_title')}
                        background={background}
                        onPress={() => {
                          setShowAudioModal(true);
                          handleCloseModal();
                        }}
                      />
                    )}

                  {/* {connectState === CONNECTED && (
                    <List.Item
                      title={
                        openMicro ? t('Close Microphone') : t('Open Microphone')
                      }
                      background={background}
                      onPress={() => {
                        setOpenMicro(!openMicro);
                        if (!openMicro) {
                          postData2Webview('openMicro');
                        } else {
                          postData2Webview('closeMicro');
                        }
                        handleCloseModal();
                      }}
                    />
                  )} */}

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
                    route.params?.streamType !== 'cloud' && (
                      <List.Item
                        title={t('Send text')}
                        background={background}
                        onPress={() => {
                          setShowMessageModal(true);
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
              </ScrollView>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      {settings.show_menu && (
        <View style={styles.quickMenu}>
          <IconButton
            icon="menu"
            size={28}
            onPress={() => {
              setShowModal(true);
            }}
          />
        </View>
      )}

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
            inputTouch:
              route.params?.sessionId === 'MINECRAFTDUNGEONS' ||
              route.params?.sessionId === 'MICROSOFTFLIGHTSIMULATOR',
            // route.params?.sessionId === 'GENSHINIMPACT',
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
  quickMenu: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    zIndex: 10,
  },
});

export default StreamScreen;
