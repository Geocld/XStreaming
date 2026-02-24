import React from 'react';
import {
  View,
  Alert,
  NativeModules,
  NativeEventEmitter,
  StyleSheet,
  ScrollView,
  Dimensions,
  ToastAndroid,
  Platform,
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
import {RTCView, MediaStream, RTCRtpReceiver} from 'react-native-webrtc';
import Orientation from 'react-native-orientation-locker';
import Spinner from '../components/Spinner';
import {useSelector} from 'react-redux';
import XcloudApi from '../xCloud';
import WebApi from '../web';
import {getSettings, saveSettings} from '../store/settingStore';
import {saveSettings as saveGamepadLayout} from '../store/gamepadStore';
import {useTranslation} from 'react-i18next';
import webRTCClient from '../webrtc';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';
import {XBOX_360_GAMEPAD_MAPING} from '../common/usbGamepadMaping';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import VirtualGamepadEditor, {
  ButtonConfig,
} from '../components/VirtualGamepadEditor';
import PerfPanel from '../components/PerfPanel';

const log = debugFactory('NativeStreamScreen');

const CONNECTED = 'connected';
const CLOSED = 'closed';
const FAILED = 'failed';
const DUALSENSE = 'DualSenseController';
const LIVE_GAMEPAD_PROFILE = 'LiveLayout';

const {
  FullScreenManager,
  GamepadManager,
  UsbRumbleManager,
  SensorModule,
  GamepadSensorModule,
} = NativeModules;

let defaultMaping: any = GAMEPAD_MAPING;
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

function NativeStreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);

  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [streamApi, setStreamApi] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const [isExiting, setIsExiting] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showMessageModal, setShowMessageModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [connectState, setConnectState] = React.useState('');
  const [performance, setPerformance] = React.useState<any>({});
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [modalMaxHeight, setModalMaxHeight] = React.useState(250);
  const [message, setMessage] = React.useState('');
  const [messageSending, setMessageSending] = React.useState(false);
  const [showGamepadEditor, setShowGamepadEditor] = React.useState(false);
  const [editorProfile, setEditorProfile] = React.useState('');
  const [gamepadLayoutVersion, setGamepadLayoutVersion] = React.useState(0);
  // const [openMicro, setOpenMicro] = React.useState(false);
  const xHomeApiRef = React.useRef<any>(undefined);
  const xCloudApiRef = React.useRef<any>(undefined);

  // webrtc
  const [webrtcClient, setWebrtcClient] = React.useState<any>(undefined);
  const [remote, setRemote] = React.useState<any>(null);
  const remoteStream = React.useRef<any>(null);
  const keepaliveInterval = React.useRef<any>(null);
  const performanceInterval = React.useRef<any>(null);
  const connectStateRef = React.useRef<any>('');

  const gpDownEventListener = React.useRef<any>(undefined);
  const gpUpEventListener = React.useRef<any>(undefined);
  const dpDownEventListener = React.useRef<any>(undefined);
  const dpUpEventListener = React.useRef<any>(undefined);
  const stickEventListener = React.useRef<any>(undefined);
  const triggerEventListener = React.useRef<any>(undefined);
  const isRightstickMoving = React.useRef(false);
  const timer = React.useRef<any>(undefined);
  const frameTimer = React.useRef<any>(undefined);
  const isRequestExit = React.useRef(false);
  const isConnected = React.useRef(false);

  const isTriggerWork = React.useRef(false);

  // event
  const usbGpEventListener = React.useRef<any>(undefined);
  const sensorEventListener = React.useRef<any>(undefined);

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
      const pressedButtons: any = [];
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
        webrtcClient && webrtcClient.setGamepadState(gpState);
      }, 1000 / _settings.polling_rate);
    } else {
      log.info('Entry normal mode');
      gpDownEventListener.current = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (_settings.short_trigger) {
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
            if (_settings.short_trigger) {
              gpState[keyName] = 0;
            }
          } else {
            gpState[keyName] = 0;
          }
        },
      );

      const syncDpadState = pressedKeys => {
        const activeKeys = new Set(pressedKeys ?? []);
        const _gpMaping = _settings.native_gamepad_maping ?? defaultMaping;
        ['DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight'].forEach(direction => {
          const keyCode = _gpMaping[direction];
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          gpState[keyName] = activeKeys.has(keyCode) ? 1 : 0;
        });
      };

      dpDownEventListener.current = eventEmitter.addListener(
        'onDpadKeyDown',
        event => {
          const pressedKeys = Array.isArray(event.dpadIdxList)
            ? event.dpadIdxList
            : event.dpadIdx >= 0
            ? [event.dpadIdx]
            : [];
          syncDpadState(pressedKeys);
        },
      );

      dpUpEventListener.current = eventEmitter.addListener(
        'onDpadKeyUp',
        () => {
          syncDpadState([]);
        },
      );

      stickEventListener.current = eventEmitter.addListener(
        'onStickMove',
        event => {
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
          // Notice: some controllers will emit onTrigger and onGamepadKeyDown at the same time

          if (
            !isTriggerWork.current &&
            (event.leftTrigger > 0 || event.rightTrigger > 0)
          ) {
            isTriggerWork.current = true;
          }

          if (!isTriggerWork.current) {
            return;
          }

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
        webrtcClient && webrtcClient.setGamepadState(gpState);
      }, 1000 / _settings.polling_rate);
    }

    // Sensor
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

          let stickX: any = x / 32767;
          let stickY: any = y / 32767;

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

    // Back action
    navigation.addListener('beforeRemove', e => {
      stopVibrate();
      if (Platform.isTV) {
        if (e.data.action.type !== 'GO_BACK') {
          navigation.dispatch(e.data.action);
        } else {
          // Exit directly in Android TV
          const _streamApi =
            route.params?.streamType === 'cloud'
              ? xCloudApiRef.current
              : xHomeApiRef.current;
          setLoading(true);
          setIsExiting(true);
          if (_streamApi) {
            _streamApi.stopStream().then(() => {
              setTimeout(() => {
                setIsExiting(false);
                Orientation.unlockAllOrientations();
                FullScreenManager.immersiveModeOff();
                const dest =
                  route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
                navigation.navigate({
                  name: dest,
                  params: {needRefresh: true},
                });
              }, 2000);
            });
          }
        }
      } else {
        if (e.data.action.type !== 'GO_BACK') {
          navigation.dispatch(e.data.action);
        } else {
          e.preventDefault();

          // Show confirm modal
          setShowModal(true);
          GamepadManager.setCurrentScreen('');
        }
      }
    });

    if (route.params?.sessionId) {
      log.info('Stream screen receive sessionId:', route.params?.sessionId);
    }
    if (route.params?.streamType) {
      log.info('Stream screen receive streamType:', route.params?.streamType);
    }

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
          xCloudApiRef.current = _xCloudApi;
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
          xHomeApiRef.current = _xHomeApi;
        }
      }
    }

    if (streamApi && webrtcClient === undefined) {
      setWebrtcClient(new webRTCClient());
    }

    if (streamApi && webrtcClient !== undefined) {
      webrtcClient.init();

      remoteStream.current = new MediaStream(undefined);

      webrtcClient.setPollRate(_settings.polling_rate);

      webrtcClient.setTrackHandler(event => {
        const track = event.track;
        if (!remoteStream.current) {
          remoteStream.current = new MediaStream();
        }
        remoteStream.current.addTrack(track, remoteStream.current);
      });

      webrtcClient.setSdpHandler((client, offer) => {
        streamApi
          .sendChatSdp(offer)
          .then(sdpResponse => {
            log.info('sendChatSdp.exchangeResponse:', sdpResponse);
            const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);

            webrtcClient.setRemoteOffer(sdpDetails.sdp);
          })
          .catch(error => {
            console.log('ChatSDP Exchange error:', error);
          });
      });

      webrtcClient.setConnectedHandler(state => {
        if (state === CONNECTED) {
          // Connected
          if (!isConnected.current) {
            ToastAndroid.show(t('Connected'), ToastAndroid.SHORT);
          }
          setLoadingText(`${t(CONNECTED)}`);
          setLoading(false);
          isConnected.current = true;

          // Alway show virtual gamepad
          if (_settings.show_virtual_gamead) {
            setShowVirtualGamepad(true);
          }

          // Alway show performance
          if (_settings.show_performance) {
            setShowPerformance(true);
          }

          setRemote(remoteStream.current.toURL());

          const sendFrame = () => {
            webrtcClient &&
              webrtcClient.getChannelProcessor('input')?.addProcessedFrame({
                serverDataKey: new Date().getTime(),
                firstFramePacketArrivalTimeMs: 9954.2,
                frameSubmittedTimeMs: 9954.2,
                frameDecodedTimeMs: 10033,
                frameRenderedTimeMs: 10033,
                expectedDisplayTime: 10034,
              });
          };
          setTimeout(() => {
            sendFrame();
          }, 2000);

          if (!frameTimer.current) {
            frameTimer.current = setInterval(() => {
              sendFrame();
            }, 10 * 1000);
          }

          // Start keepalive loop
          if (!keepaliveInterval.current) {
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
          }

          if (!performanceInterval.current) {
            performanceInterval.current = setInterval(() => {
              webrtcClient.getStreamState().then(res => {
                setPerformance(res);
              });
            }, 1000);
          }
        } else if (state === CLOSED) {
          if (isRequestExit.current) {
            return;
          }
          if (connectStateRef.current !== CONNECTED) {
            return;
          }
          Alert.alert(t('Warning'), t('Streaming is closed'), [
            {
              text: t('Confirm'),
              style: 'default',
              onPress: () => {
                exit();
              },
            },
          ]);
        } else if (state === FAILED) {
          if (isConnected.current) {
            Alert.alert(t('Warning'), t('Reconnected failed'), [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  exit();
                },
              },
            ]);
          } else {
            Alert.alert(t('Warning'), t('NAT failed'), [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  exit();
                },
              },
            ]);
          }
        }

        // Toggle microphone
        setConnectState(state);
        connectStateRef.current = state;
      });

      webrtcClient.setRumbleHandler(rumbleData => {
        if (!_settings.vibration) {
          return;
        }
        // console.log('rumbleData:', rumbleData);
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
              _settings.left_trigger_type || 0,
              _settings.left_trigger_effects || [],
              _settings.right_trigger_type || 0,
              _settings.right_trigger_effects || [],
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
            _settings.rumble_intensity || 3,
          );

          if (rumbleData.duration < 20) {
            setTimeout(() => {
              GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
            }, 300);
          }
        }
      });

      const exit = () => {
        const dest = route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
        setLoading(false);
        webrtcClient && webrtcClient.close();
        streamApi
          .stopStream()
          .then(() => {
            setTimeout(() => {
              setIsExiting(false);
              Orientation.unlockAllOrientations();
              FullScreenManager.immersiveModeOff();
              navigation.navigate({
                name: dest,
                params: {needRefresh: true},
              });
            }, 500);
          })
          .catch(() => {
            Orientation.unlockAllOrientations();
            FullScreenManager.immersiveModeOff();
            navigation.navigate({
              name: dest,
              params: {needRefresh: true},
            });
          });
      };

      setLoading(true);
      setLoadingText(`${t('Connecting...')}`);

      const setCodec = sdp => {
        const codec = _settings.codec;
        const codecArr = codec.split('-');
        const mimeType = codecArr[0]; // H264
        const profiles = codecArr[1]; // ['4d'] 4d = high, 42e = mid, 420 = low

        if (!mimeType || !profiles) {
          return sdp;
        }
        const capabilities = RTCRtpReceiver.getCapabilities('video');

        if (capabilities === null) {
          return sdp;
        }

        const codecs: any = capabilities.codecs;
        const prefCodecs: any = [];

        for (let i = 0; i < codecs.length; i++) {
          if (codecs[i].mimeType === mimeType) {
            if (profiles.length > 0) {
              for (let j = 0; j < profiles.length; j++) {
                if (
                  codecs[i].sdpFmtpLine?.indexOf(
                    'profile-level-id=' + profiles[j],
                  ) !== -1
                ) {
                  console.log(
                    'Adding codec as preference:',
                    codecs[i],
                    profiles[j],
                  );
                  prefCodecs.push(codecs[i]);
                }
              }
            } else {
              console.log('Adding codec as preference:', codecs[i]);
              prefCodecs.push(codecs[i]);
            }
          }
        }

        if (prefCodecs.length === 0) {
          console.log(
            'setCodec() No video codec matches with mimetype:',
            mimeType,
          );
          return sdp;
        }

        if (mimeType.indexOf('H264') > -1) {
          // High=4d Medium=42e Low=420
          const h264Pattern = /a=fmtp:(\d+).*profile-level-id=([0-9a-f]{6})/g;
          const profilePrefix = profiles[0];
          const preferredCodecIds: any = [];
          // Find all H.264 codec profile IDs
          const matches = sdp.matchAll(h264Pattern) || [];
          for (const match of matches) {
            const id = match[1];
            const profileId = match[2];

            if (profileId.startsWith(profilePrefix)) {
              preferredCodecIds.push(id);
            }
          }
          // No preferred IDs found
          if (!preferredCodecIds.length) {
            return sdp;
          }

          const lines = sdp.split('\r\n');
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (!line.startsWith('m=video')) {
              continue;
            }

            // https://datatracker.ietf.org/doc/html/rfc4566#section-5.14
            // m=<media> <port> <proto> <fmt>
            // m=video 9 UDP/TLS/RTP/SAVPF 127 39 102 104 106 108
            const tmp = line.trim().split(' ');

            // Get array of <fmt>
            // ['127', '39', '102', '104', '106', '108']
            let ids = tmp.slice(3);

            // Remove preferred IDs in the original array
            ids = ids.filter(item => !preferredCodecIds.includes(item));

            // Put preferred IDs at the beginning
            ids = preferredCodecIds.concat(ids);

            // Update line's content
            lines[lineIndex] = tmp.slice(0, 3).concat(ids).join(' ');

            break;
          }

          return lines.join('\r\n');
        }
      };

      streamApi
        .startSession(route.params?.sessionId, _settings.resolution)
        .then(() => {
          setLoadingText(
            `${t('Configuration obtained successfully, initiating offer...')}`,
          );
          webrtcClient.createOffer().then(offer => {
            // Set codec
            if (_settings.codec !== '') {
              offer.sdp = setCodec(offer.sdp);
            }

            streamApi
              .sendSDPOffer(offer)
              .then(sdpResponse => {
                setLoadingText(
                  `${t('Remote offer retrieved successfully...')}`,
                );
                log.info('sdpResponse.exchangeResponse:', sdpResponse);
                const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);
                webrtcClient.setRemoteOffer(sdpDetails.sdp).then(() => {
                  setLoadingText(`${t('Ready to send ICE...')}`);
                  const iceCandidates = webrtcClient.getIceCandidates();
                  streamApi
                    .sendICECandidates(iceCandidates)
                    .then(iceDetails => {
                      log.info(
                        'Client - ICE iceDetails:',
                        JSON.stringify(iceDetails),
                      );
                      webrtcClient.setIceCandidates(iceDetails);
                      setLoadingText(`${t('Exchange ICE successfully...')}`);
                    })
                    .catch(e => {
                      Alert.alert(
                        t('Warning'),
                        '[sendICECandidates] fail:' + e,
                        [
                          {
                            text: t('Confirm'),
                            style: 'default',
                            onPress: () => {
                              exit();
                            },
                          },
                        ],
                      );
                    });
                });
              })
              .catch(e => {
                Alert.alert(t('Warning'), '[sendSDPOffer] fail:' + e, [
                  {
                    text: t('Confirm'),
                    style: 'default',
                    onPress: () => {
                      exit();
                    },
                  },
                ]);
              });
          });
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
                const error =
                  route.params?.streamType === 'cloud'
                    ? t('noAllow')
                    : t('homeNoAllow');
                msg =
                  `[StartSession](${
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home'
                  }) Fail:` + error;
              } else {
                msg =
                  `[StartSession](${
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home'
                  }) Fail:` + e;
              }
            }
            Alert.alert(t('Warning'), msg, [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  const dest =
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
                  navigation.navigate(dest);
                },
              },
            ]);
          }
        });
    }

    setTimeout(() => {
      Orientation.lockToLandscape();

      setTimeout(() => {
        const {height: dHeight} = Dimensions.get('window');
        setModalMaxHeight(dHeight - 50);
      }, 100);
    }, 500);

    return () => {
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();
      stopVibrate();
      webrtcClient && webrtcClient.close();
      usbGpEventListener.current && usbGpEventListener.current.remove();
      gpDownEventListener.current && gpDownEventListener.current.remove();
      gpUpEventListener.current && gpUpEventListener.current.remove();
      dpDownEventListener.current && dpDownEventListener.current.remove();
      dpUpEventListener.current && dpUpEventListener.current.remove();
      stickEventListener.current && stickEventListener.current.remove();
      triggerEventListener.current && triggerEventListener.current.remove();
      sensorEventListener.current && sensorEventListener.current.remove();
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      if (frameTimer.current) {
        clearInterval(frameTimer.current);
        frameTimer.current = null;
      }
      if (keepaliveInterval.current) {
        clearInterval(keepaliveInterval.current);
        keepaliveInterval.current = null;
      }
      if (performanceInterval.current) {
        clearInterval(performanceInterval.current);
        performanceInterval.current = null;
      }
      GamepadManager.setCurrentScreen('');
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
    };
  }, [
    t,
    route.params?.sessionId,
    route.params?.streamType,
    route.params?.isUsbMode,
    route.params?.usbController,
    webrtcClient,
    streamApi,
    streamingTokens,
    navigation,
    authentication,
  ]);

  const handlePowerOff = async () => {
    const webApi = new WebApi(webToken);
    const powerOffRes = await webApi.powerOff(route.params?.sessionId);
    console.log('powerOff:', powerOffRes);
  };

  const handleSendMessage = async () => {
    const webApi = new WebApi(webToken);
    setMessageSending(true);
    let text = message.trim();
    if (message.length > 100) {
      text = text.substring(0, 100);
    }
    try {
      await webApi.sendText(route.params?.sessionId, text);
      setMessage('');
      ToastAndroid.show(t('Sended'), ToastAndroid.SHORT);
    } catch (e) {}
    setMessageSending(false);
  };

  const handleExit = (off = false) => {
    setLoading(true);
    setLoadingText(t('Disconnecting...'));
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    webrtcClient && webrtcClient.close();
    streamApi.stopStream().then(() => {
      if (off) {
        handlePowerOff();
      }
      setTimeout(() => {
        setIsExiting(false);
        setLoading(false);
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

  const handleCloseModal = () => {
    setShowModal(false);
    GamepadManager.setCurrentScreen('stream');

    if (!isConnected.current) {
      setLoading(true);
    }
  };

  // Virtual gamepad press start
  const handleButtonPressIn = name => {
    // Hold button
    const hold_buttons = settings.hold_buttons || [];
    if (hold_buttons.includes(name)) {
      gpState[name] = gpState[name] === 1 ? 0 : 1;
      return;
    }
    gpState[name] = 1;
  };

  // Virtual gamepad press end
  const handleButtonPressOut = name => {
    // Hold button
    const hold_buttons = settings.hold_buttons || [];
    if (hold_buttons.includes(name)) {
      return;
    }
    setTimeout(() => {
      gpState[name] = 0;
    }, 50);
  };

  // Virtual gamepad stick move
  const handleStickMove = (id, data) => {
    // console.log('handleStickMove:', id, data);
    let leveledX: any = data.x;
    let leveledY: any = data.y;

    if (typeof leveledX === 'number') {
      leveledX = leveledX.toFixed(2);
    }
    if (typeof leveledY === 'number') {
      leveledX = leveledY.toFixed(2);
    }

    if (id === 'right') {
      if (Math.abs(leveledX) > 0 || Math.abs(leveledY) > 0) {
        isRightstickMoving.current = true;
      } else {
        isRightstickMoving.current = false;
      }
      gpState.RightThumbXAxis = Number(leveledX);
      gpState.RightThumbYAxis = Number(leveledY);
    } else {
      gpState.LeftThumbXAxis = Number(leveledX);
      gpState.LeftThumbYAxis = Number(leveledY);
    }
  };

  const requestExit = (off = false) => {
    isRequestExit.current = true;
    setShowPerformance(false);
    setShowVirtualGamepad(false);
    webrtcClient && webrtcClient.close();
    setShowModal(false);
    if (settings.sensor) {
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
    }
    handleExit(off);
  };

  // const handleToggleMic = () => {
  //   if (!webrtcClient) {
  //     return;
  //   }
  //   if (webrtcClient.getChannelProcessor('chat').isPaused === true) {
  //     webrtcClient.getChannelProcessor('chat').startMic();
  //     setOpenMicro(true);
  //   } else {
  //     webrtcClient.getChannelProcessor('chat').stopMic();
  //     setOpenMicro(false);
  //   }

  //   handleCloseModal();
  // };

  const getActiveProfileName = React.useCallback(() => {
    return settings.custom_virtual_gamepad || LIVE_GAMEPAD_PROFILE;
  }, [settings.custom_virtual_gamepad]);

  const handleOpenGamepadEditor = () => {
    setEditorProfile(getActiveProfileName());
    setShowGamepadEditor(true);
  };

  const handleSaveGamepadLayout = (layout: ButtonConfig[]) => {
    const profileName = editorProfile || getActiveProfileName();
    saveGamepadLayout(profileName, layout);
    if (!settings.custom_virtual_gamepad) {
      settings.custom_virtual_gamepad = profileName;
    }
    saveSettings(settings);
    setSettings({...settings});
    setGamepadLayoutVersion(prev => prev + 1);
    setShowVirtualGamepad(true);
    setShowGamepadEditor(false);
  };

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
          refreshKey={gamepadLayoutVersion}
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

  const renderOptionsModal = () => {
    const background = {
      borderless: false,
      color: 'rgba(255, 255, 255, 0.2)',
      foreground: true,
    };

    return (
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
                        setShowPerformance(!showPerformance);
                        handleCloseModal();
                      }}
                    />
                  )}

                  {connectState === CONNECTED && (
                    <List.Item
                      title={t('Toggle Virtual Gamepad')}
                      background={background}
                      onPress={() => {
                        setShowVirtualGamepad(!showVirtualGamepad);
                        handleCloseModal();
                      }}
                    />
                  )}

                  {connectState === CONNECTED && showVirtualGamepad && (
                    <List.Item
                      title={t('Customize buttons of virtual gamepad')}
                      background={background}
                      onPress={() => {
                        handleCloseModal();
                        handleOpenGamepadEditor();
                      }}
                    />
                  )}

                  {/* {connectState === CONNECTED && (
                    <List.Item
                      title={
                        openMicro ? t('Close Microphone') : t('Open Microphone')
                      }
                      background={background}
                      onPress={handleToggleMic}
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
                          requestExit(true);
                        }}
                      />
                    )}

                  <List.Item
                    title={t('Disconnect')}
                    background={background}
                    onPress={() => {
                      requestExit(false);
                    }}
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
    );
  };

  const renderPerformancePanel = () => {
    if (showPerformance) {
      return <PerfPanel performance={performance} />;
    } else {
      return null;
    }
  };

  const renderTextPanel = () => {
    return (
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
    );
  };

  const renderMenu = () => {
    if (settings.show_menu) {
      return (
        <View style={styles.quickMenu}>
          <IconButton
            icon="menu"
            size={28}
            onPress={() => {
              setShowModal(true);
            }}
          />
        </View>
      );
    } else {
      return null;
    }
  };

  return (
    <View style={styles.container}>
      {loading && (
        <Spinner
          loading={true}
          text={loadingText}
          cancelable={true}
          closeCb={() => {
            setLoading(false);
            setShowModal(true);
          }}
        />
      )}

      {remoteStream.current?.toURL() && (
        <RTCView
          style={styles.player}
          zOrder={9}
          objectFit={settings.video_format === 'Zoom' ? 'cover' : 'contain'}
          streamURL={remote}
        />
      )}

      {renderPerformancePanel()}

      {renderVirtualGamepad()}

      <VirtualGamepadEditor
        visible={showGamepadEditor}
        profileName={editorProfile || getActiveProfileName()}
        onSave={handleSaveGamepadLayout}
        onCancel={() => setShowGamepadEditor(false)}
      />

      {renderOptionsModal()}

      {renderTextPanel()}

      {renderMenu()}
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
    backgroundColor: 'black',
  },
  modal: {
    // backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginLeft: '32%',
    marginRight: '32%',
  },
  quickMenu: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    zIndex: 99,
  },
});

export default NativeStreamScreen;
