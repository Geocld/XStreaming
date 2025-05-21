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
import {RTCView, MediaStream, RTCRtpReceiver} from 'react-native-webrtc';
import Orientation from 'react-native-orientation-locker';
import Spinner from 'react-native-loading-spinner-overlay';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import XcloudApi from '../xCloud';
import WebApi from '../web';
import {getSettings, saveSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import webRTCClient from '../webrtc';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';
import {XBOX_360_GAMEPAD_MAPING} from '../common/usbGamepadMaping';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import PerfPanel from '../components/PerfPanel';

const log = debugFactory('NativeStreamScreen');

const CONNECTED = 'connected';
const CONNECTING = 'connecting';
const CLOSED = 'closed';
const FAILED = 'failed';
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

const keyDownTimestamp = {};

function NativeStreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const streamingTokens = useSelector(state => state.streamingTokens);
  const webToken = useSelector(state => state.webToken);

  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState(false);
  const [streamApi, setStreamApi] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [isExiting, setIsExiting] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showMessageModal, setShowMessageModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [connectState, setConnectState] = React.useState('');
  const [performance, setPerformance] = React.useState({});
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [needPoweroff, setNeedPoweroff] = React.useState(false);
  const [modalMaxHeight, setModalMaxHeight] = React.useState(250);
  const [message, setMessage] = React.useState('');
  const [messageSending, setMessageSending] = React.useState(false);

  // webrtc
  const [webrtcClient, setWebrtcClient] = React.useState(undefined);
  const [remote, setRemote] = React.useState(null);
  const remoteStream = React.useRef(null);
  const keepaliveInterval = React.useRef(null);
  const performanceInterval = React.useRef(null);
  const connectStateRef = React.useRef('');

  const gpDownEventListener = React.useRef(undefined);
  const gpUpEventListener = React.useRef(undefined);
  const dpDownEventListener = React.useRef(undefined);
  const dpUpEventListener = React.useRef(undefined);
  const leftStickEventListener = React.useRef(undefined);
  const rightStickEventListener = React.useRef(undefined);
  const triggerEventListener = React.useRef(undefined);
  const isLeftTriggerCanClick = React.useRef(false);
  const isRightTriggerCanClick = React.useRef(false);
  const isRightstickMoving = React.useRef(false);
  const timer = React.useRef(undefined);
  const frameTimer = React.useRef(undefined);
  const isRequestExit = React.useRef(false);

  // event
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
        webrtcClient && webrtcClient.setGamepadState(gpState);
      }, 1000 / _settings.polling_rate);
    } else {
      log.info('Entry normal mode');
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
          if (Math.abs(event.axisX) > 0.1 || Math.abs(event.axisY) > 0.1) {
            isRightstickMoving.current = true;
          } else {
            isRightstickMoving.current = false;
          }

          gpState.RightThumbXAxis = normaliseAxis(event.axisX);
          gpState.RightThumbYAxis = normaliseAxis(event.axisY);
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          if (!isLeftTriggerCanClick.current) {
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
          }

          if (!isRightTriggerCanClick.current) {
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

      webrtcClient.setConnectedHandler(state => {
        if (state === CONNECTED) {
          // Connected
          ToastAndroid.show(t('Connected'), ToastAndroid.SHORT);
          setLoadingText(`${t(CONNECTED)}`);
          setLoading(false);

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
              });
          };
          setTimeout(() => {
            sendFrame();
          }, 3000);

          if (!frameTimer.current) {
            frameTimer.current = setInterval(() => {
              sendFrame();
            }, 5 * 1000);
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
                res.resolution = '1920 X 720';
                if (
                  _settings.resolution === 1080 ||
                  _settings.resolution === 1081
                ) {
                  res.resolution = '1920 X 1080';
                }
                setPerformance(res);
              });
            }, 1000);
          }
        } else if (state === CLOSED) {
          if (isRequestExit.current) {
            return;
          }
          if (connectStateRef.curren !== CONNECTED) {
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

        setConnectState(state);
        connectStateRef.current = state;
      });

      const exit = () => {
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
                name: 'Home',
                params: {needRefresh: true},
              });
            }, 500);
          })
          .catch(e => {
            Orientation.unlockAllOrientations();
            FullScreenManager.immersiveModeOff();
            navigation.navigate({
              name: 'Home',
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

        const codecs = capabilities.codecs;
        const prefCodecs = [];

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
          const preferredCodecIds = [];
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

      const setBitrate = (sdp, media, bitrate) => {
        const lines = sdp.split('\r\n');

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
          let _media = '';
          let line = lines[lineNumber];
          if (!line.startsWith('m=')) {
            continue;
          }
          if (line.startsWith(`m=${media}`)) {
            _media = media;
          }
          // Invalid media, continue looking
          if (!_media) {
            continue;
          }

          const bLine = `b=AS:${bitrate}`;

          while ((lineNumber++, lineNumber < lines.length)) {
            line = lines[lineNumber];

            // Ignore lines that start with "i=" or "c="
            if (line.startsWith('i=') || line.startsWith('c=')) {
              continue;
            }

            if (line.startsWith('b=AS:')) {
              // Replace bitrate
              lines[lineNumber] = bLine;
              // Stop lookine for "b=AS:" line
              break;
            }

            if (line.startsWith('m=')) {
              // "b=AS:" line not found, add "b" line before "m="
              lines.splice(lineNumber, 0, bLine);
              // Stop
              break;
            }
          }
        }

        return lines.join('\r\n');
      };

      streamApi
        .startSession(route.params?.sessionId, _settings.resolution)
        .then(configuration => {
          setLoadingText(
            `${t('Configuration obtained successfully, initiating offer...')}`,
          );
          webrtcClient.createOffer().then(offer => {
            // Set codec
            if (_settings.codec !== '') {
              offer.sdp = setCodec(offer.sdp);
            }

            // Set bitrate
            if (route.params?.streamType === 'cloud') {
              if (
                _settings.xcloud_bitrate_mode === 'custom' &&
                _settings.xcloud_bitrate !== 0
              ) {
                console.log(
                  'setVideoBitrate xcloud:',
                  _settings.xcloud_bitrate + 'Mb/s',
                );
                offer.sdp = setBitrate(
                  offer.sdp,
                  'video',
                  _settings.xcloud_bitrate,
                );
              }
            } else {
              if (
                _settings.xhome_bitrate_mode === 'custom' &&
                _settings.xhome_bitrate !== 0
              ) {
                console.log(
                  'setVideoBitrate xhome:',
                  _settings.xhome_bitrate + 'Mb/s',
                );
                offer.sdp = setBitrate(
                  offer.sdp,
                  'video',
                  _settings.xhome_bitrate,
                );
              }
            }

            if (_settings.audio_bitrate_mode === 'custom') {
              offer.sdp = setBitrate(
                offer.sdp,
                'audio',
                _settings.audio_bitrate,
              );
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
                msg =
                  '[StartSession] Fail:' + t('WaitingForServerToRegister') + e;
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
                  navigation.navigate('Home');
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
      leftStickEventListener.current && leftStickEventListener.current.remove();
      rightStickEventListener.current &&
        rightStickEventListener.current.remove();
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
    setLoading(true);
    setLoadingText(t('Disconnecting...'));
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    webrtcClient && webrtcClient.close();
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
  };

  // Virtual gamepad press
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
    let leveledX = data.dist.x;
    let leveledY = data.dist.y;

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
      webrtcClient
        .getChannelProcessor('input')
        .moveRightStick(Number(leveledX), Number(leveledY));
    } else {
      webrtcClient
        .getChannelProcessor('input')
        .moveLeftStick(Number(leveledX), Number(leveledY));
    }
  };

  const requestExit = () => {
    isRequestExit.current = true;
    setShowPerformance(false);
    setShowVirtualGamepad(false);
    webrtcClient && webrtcClient.close();
    setShowModal(false);
    if (settings.sensor) {
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
    }
    handleExit();
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

                  {connectState === CONNECTED &&
                    settings.gamepad_kernal === 'Native' && (
                      <List.Item
                        title={t('Toggle Virtual Gamepad')}
                        background={background}
                        onPress={() => {
                          setShowVirtualGamepad(!showVirtualGamepad);
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
      <Spinner
        cancelable
        visible={loading}
        color={'#107C10'}
        textContent={loadingText}
        textStyle={styles.spinnerTextStyle}
      />

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
  },
  spinnerTextStyle: {
    color: '#107C10',
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
