import React from 'react';
import {
  View,
  Image,
  Alert,
  NativeModules,
  NativeEventEmitter,
  StyleSheet,
  ScrollView,
  Dimensions,
  ToastAndroid,
  Platform,
  Vibration,
  AppState,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import {Portal, Modal, Card, List, IconButton} from 'react-native-paper';
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
import {
  applyScreenOrientation,
  getCurrentScreenOrientation,
  type ScreenOrientation,
} from '../utils/orientation';
import VirtualGamepad from '../components/VirtualGamepad';
import GamepadButton from '../components/GamepadButton';
import AnalogStick from '../components/AnalogStick';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import VirtualGamepadEditor, {
  ButtonConfig,
} from '../components/VirtualGamepadEditor';
import PerfPanel from '../components/PerfPanel';
import RTCFsrView from '../components/RTCFsrView';
import NativeTouchOverlay from '../components/NativeTouchOverlay';
import type {PointerWireData} from '../webrtc/Channel/Input';
import {
  normalizeMacroSteps,
  VIRTUAL_MACRO_ALLOWED_BUTTONS,
  VIRTUAL_MACRO_BUTTON_NAME,
  DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
} from '../utils/virtualMacro';

const log = debugFactory('NativeStreamScreen');

const CONNECTED = 'connected';
const CLOSED = 'closed';
const FAILED = 'failed';
const DUALSENSE = 'DualSenseController';
const LIVE_GAMEPAD_PROFILE = 'LiveLayout';
const PICTURE_IN_PICTURE_MODE_CHANGED = 'pictureInPictureModeChanged';

const {
  FullScreenManager,
  GamepadManager,
  UsbRumbleManager,
  SensorModule,
  GamepadSensorModule,
  PipManager,
  NativeInputDialog,
} = NativeModules;

let defaultMaping: any = GAMEPAD_MAPING;
let triggerMax = 0.8;

const GAMEPAD_DIGITAL_KEYS = [
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

const SYSTEM_UI_TARGET_SHOW_MESSAGE_DIALOG =
  '/streaming/systemUi/messages/ShowMessageDialog';
const SYSTEM_UI_TARGET_SHOW_VIRTUAL_KEYBOARD =
  '/streaming/systemUi/messages/ShowVirtualKeyboard';
const STREAMING_TOUCHCONTROLS_SCOPE = '/streaming/touchcontrols';

const createGamepadState = (gamepadIndex = 0) => ({
  GamepadIndex: gamepadIndex,
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
});

const resetGamepadState = (
  state: any,
  gamepadIndex = state.GamepadIndex ?? 0,
) => {
  state.GamepadIndex = gamepadIndex;
  state.A = 0;
  state.B = 0;
  state.X = 0;
  state.Y = 0;
  state.LeftShoulder = 0;
  state.RightShoulder = 0;
  state.LeftTrigger = 0;
  state.RightTrigger = 0;
  state.View = 0;
  state.Menu = 0;
  state.LeftThumb = 0;
  state.RightThumb = 0;
  state.DPadUp = 0;
  state.DPadDown = 0;
  state.DPadLeft = 0;
  state.DPadRight = 0;
  state.Nexus = 0;
  state.LeftThumbXAxis = 0.0;
  state.LeftThumbYAxis = 0.0;
  state.RightThumbXAxis = 0.0;
  state.RightThumbYAxis = 0.0;
};

const gpState = createGamepadState(0);

type NativeStreamScreenProps = {
  navigation: any;
  route: any;
  portraitMode?: boolean;
};

export function NativeStreamScreenBase({
  navigation,
  route,
  portraitMode = false,
}: NativeStreamScreenProps) {
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);

  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [streamApi, setStreamApi] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const [isExiting, setIsExiting] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(false);
  const [connectState, setConnectState] = React.useState('');
  const [performance, setPerformance] = React.useState<any>({});
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [modalMaxHeight, setModalMaxHeight] = React.useState(250);
  const [messageSending, setMessageSending] = React.useState(false);
  const [showGamepadEditor, setShowGamepadEditor] = React.useState(false);
  const [editorProfile, setEditorProfile] = React.useState('');
  const [gamepadLayoutVersion, setGamepadLayoutVersion] = React.useState(0);
  const [openMicro, setOpenMicro] = React.useState(false);
  const [isInPictureInPicture, setIsInPictureInPicture] = React.useState(false);
  const xHomeApiRef = React.useRef<any>(undefined);
  const xCloudApiRef = React.useRef<any>(undefined);
  const isRumbling = React.useRef(false);
  const systemKeyboardTransactionRef = React.useRef<any>(null);
  const handleExitRef = React.useRef<(off?: boolean) => void>(() => {});

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
  const audioRumbleTimer = React.useRef<any>(undefined);
  const appStateSubscription = React.useRef<any>(undefined);
  const pipEventListener = React.useRef<any>(undefined);
  const isRequestExit = React.useRef(false);
  const isConnected = React.useRef(false);
  const macroSequenceTimersRef = React.useRef<any[]>([]);
  const orientationLockTimer = React.useRef<any>(null);
  const orientationLayoutTimer = React.useRef<any>(null);
  const returnOrientationRef = React.useRef<ScreenOrientation | null>(null);
  const supportedSystemUis = React.useMemo(() => [10, 19], []);
  const shouldRestoreOrientationRef = React.useRef(false);

  const isTriggerWork = React.useRef(false);

  const clearOrientationTimers = React.useCallback(() => {
    if (orientationLockTimer.current) {
      clearTimeout(orientationLockTimer.current);
      orientationLockTimer.current = null;
    }
    if (orientationLayoutTimer.current) {
      clearTimeout(orientationLayoutTimer.current);
      orientationLayoutTimer.current = null;
    }
  }, []);

  const markOrientationForRestore = React.useCallback(() => {
    clearOrientationTimers();
    shouldRestoreOrientationRef.current = true;
  }, [clearOrientationTimers]);

  React.useEffect(() => {
    let isActive = true;
    shouldRestoreOrientationRef.current = false;
    returnOrientationRef.current = null;

    getCurrentScreenOrientation().then(orientation => {
      if (isActive) {
        returnOrientationRef.current = orientation;
      }
    });

    clearOrientationTimers();
    orientationLockTimer.current = setTimeout(() => {
      if (portraitMode) {
        Orientation.lockToPortrait();
      } else {
        Orientation.lockToLandscape();
      }
      orientationLockTimer.current = null;

      orientationLayoutTimer.current = setTimeout(() => {
        const {height: dHeight} = Dimensions.get('window');
        setModalMaxHeight(dHeight - 50);
        orientationLayoutTimer.current = null;
      }, 100);
    }, 500);

    return () => {
      isActive = false;
      clearOrientationTimers();
      if (shouldRestoreOrientationRef.current) {
        applyScreenOrientation(returnOrientationRef.current);
        shouldRestoreOrientationRef.current = false;
      } else {
        Orientation.unlockAllOrientations();
      }
    };
  }, [
    route.params?.sessionId,
    route.params?.streamType,
    clearOrientationTimers,
    portraitMode,
  ]);

  const closeSystemKeyboardModal = React.useCallback(() => {
    NativeInputDialog?.dismiss?.();
    systemKeyboardTransactionRef.current = null;
  }, []);

  const completeSystemKeyboard = React.useCallback(
    (text: string) => {
      const transaction = systemKeyboardTransactionRef.current;
      if (
        transaction &&
        transaction.isTransaction &&
        transaction.completion &&
        typeof transaction.completion.complete === 'function'
      ) {
        transaction.completion.complete(
          JSON.stringify({
            Text: text,
          }),
        );
      }
      closeSystemKeyboardModal();
    },
    [closeSystemKeyboardModal],
  );

  const cancelSystemKeyboard = React.useCallback(() => {
    const transaction = systemKeyboardTransactionRef.current;
    if (
      transaction &&
      transaction.isTransaction &&
      transaction.completion &&
      typeof transaction.completion.cancel === 'function'
    ) {
      transaction.completion.cancel();
    }
    closeSystemKeyboardModal();
  }, [closeSystemKeyboardModal]);

  const showNativeInputDialog = React.useCallback(
    async (options: any) => {
      if (isInPictureInPicture || !NativeInputDialog?.showTextInput) {
        return null;
      }

      try {
        return await NativeInputDialog.showTextInput(options);
      } catch (error) {
        return null;
      }
    },
    [isInPictureInPicture],
  );

  const openSystemKeyboardDialog = React.useCallback(
    async (event: any, payload: any) => {
      systemKeyboardTransactionRef.current = {
        id: event.id,
        isTransaction: event.isTransaction,
        completion: event.completion,
      };

      if (
        event.isTransaction &&
        event.completion &&
        typeof event.completion.setOnRemoteCancellation === 'function'
      ) {
        const transactionId = event.id;
        event.completion.setOnRemoteCancellation(() => {
          if (systemKeyboardTransactionRef.current?.id === transactionId) {
            systemKeyboardTransactionRef.current = null;
            NativeInputDialog?.dismiss?.();
          }
        });
      }

      const result = await showNativeInputDialog({
        title: payload.TitleText || '',
        message: payload.DescriptionText || '',
        text: payload.DefaultText || '',
        hint: t('Text'),
        inputScope: payload.InputScope ?? 0,
        maxLength:
          typeof payload.MaxLength === 'number' && payload.MaxLength > 0
            ? payload.MaxLength
            : 0,
        confirmText: t('Confirm'),
        cancelText: t('Cancel'),
      });

      if (systemKeyboardTransactionRef.current?.id !== event.id) {
        return;
      }

      if (result?.action === 'confirm') {
        completeSystemKeyboard(result.text || '');
      } else {
        cancelSystemKeyboard();
      }
    },
    [cancelSystemKeyboard, completeSystemKeyboard, showNativeInputDialog, t],
  );

  const handleSystemUiEvent = React.useCallback(
    (event: any) => {
      if (!event || !event.target) {
        return false;
      }

      if (isRequestExit.current) {
        if (
          event.isTransaction &&
          event.completion &&
          typeof event.completion.cancel === 'function'
        ) {
          event.completion.cancel();
        }
        return true;
      }

      if (event.target === SYSTEM_UI_TARGET_SHOW_MESSAGE_DIALOG) {
        const payload = event.payload || {};
        const title = payload.TitleText || '';
        const content = payload.ContentText || '';
        const commandButtons = [
          {
            label: payload.CommandLabel1,
            result: 0,
          },
          {
            label: payload.CommandLabel2,
            result: 1,
          },
          {
            label: payload.CommandLabel3,
            result: 2,
          },
        ];
        let hasResponded = false;

        const completeWithResult = (result?: number) => {
          if (hasResponded) {
            return;
          }
          hasResponded = true;
          if (
            event.isTransaction &&
            event.completion &&
            typeof event.completion.complete === 'function'
          ) {
            event.completion.complete(
              JSON.stringify({
                Result: result,
              }),
            );
          }
        };

        const buttons: Array<any> = [];
        commandButtons.forEach(({label, result}) => {
          if (!label) {
            return;
          }
          const buttonText = String(label);
          buttons.push({
            text: buttonText,
            onPress: () => {
              completeWithResult(result);
              setTimeout(() => {
                if (buttonText.toUpperCase().indexOf('QUIT') !== -1) {
                  handleExitRef.current(false);
                }
              }, 500);
            },
          });
        });

        if (!buttons.length) {
          buttons.push({
            text: t('Confirm'),
            onPress: () => {
              const fallbackIndex =
                typeof payload.DefaultIndex === 'number'
                  ? payload.DefaultIndex
                  : 0;
              completeWithResult(fallbackIndex);
            },
          });
        }

        Alert.alert(title, content, buttons, {
          cancelable: true,
          onDismiss: () => {
            if (!event.isTransaction) {
              return;
            }

            const dismissIndex =
              typeof payload.CancelIndex === 'number'
                ? payload.CancelIndex
                : typeof payload.DefaultIndex === 'number'
                ? payload.DefaultIndex
                : 0;

            // Message dialog should always complete with a Result value.
            // Defer to avoid racing with button onPress callback order on Android.
            setTimeout(() => {
              completeWithResult(dismissIndex);
            }, 0);
          },
        });

        return true;
      }

      if (event.target === SYSTEM_UI_TARGET_SHOW_VIRTUAL_KEYBOARD) {
        const payload = event.payload || {};
        openSystemKeyboardDialog(event, payload);
        return true;
      }

      return false;
    },
    [openSystemKeyboardDialog, t],
  );

  const handleStreamingMessage = React.useCallback((event: any) => {
    if (!event || typeof event.target !== 'string') {
      return false;
    }

    if (!event.target.startsWith(STREAMING_TOUCHCONTROLS_SCOPE)) {
      return false;
    }

    if (
      event.isTransaction &&
      event.completion &&
      typeof event.completion.cancel === 'function'
    ) {
      event.completion.cancel();
    }

    return true;
  }, []);

  // event
  const usbGpEventListener = React.useRef<any>(undefined);
  const sensorEventListener = React.useRef<any>(undefined);

  React.useEffect(() => {
    GamepadManager.setCurrentScreen('stream');
    const isUsbMode = route.params?.isUsbMode || false;
    const usbController = route.params?.usbController || 'Xbox360Controller';

    const _settings = getSettings();
    setSettings(_settings);
    resetGamepadState(gpState, 0);
    const coopDeviceIndexMap = new Map<number, number>();
    const coopGpStates = _settings.coop
      ? [gpState, createGamepadState(1)]
      : null;
    if (coopGpStates) {
      resetGamepadState(coopGpStates[0], 0);
      resetGamepadState(coopGpStates[1], 1);
    }

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

    if (portraitMode) {
      FullScreenManager.immersiveModeOff();
    } else {
      FullScreenManager.immersiveModeOn();
    }

    const stopVibrate = () => {
      GamepadManager.vibrate(10, 0, 0, 0, 0, 3);
      isRumbling.current = false;
    };

    const resolveGamepadState = (rawGamepadIndex = 0) => {
      if (!_settings.coop || !coopGpStates) {
        return gpState;
      }

      const deviceIndex =
        typeof rawGamepadIndex === 'number' ? rawGamepadIndex : -1;
      if (deviceIndex < 0) {
        return null;
      }
      if (!coopDeviceIndexMap.has(deviceIndex)) {
        if (coopDeviceIndexMap.size >= coopGpStates.length) {
          return null;
        }
        coopDeviceIndexMap.set(deviceIndex, coopDeviceIndexMap.size);
      }

      const playerIndex = coopDeviceIndexMap.get(deviceIndex);
      if (playerIndex === undefined) {
        return null;
      }
      return coopGpStates[playerIndex];
    };

    const resetButtonState = () => {
      GAMEPAD_DIGITAL_KEYS.forEach(k => {
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
      GAMEPAD_DIGITAL_KEYS.forEach(k => {
        if (combinedKeys.includes(k)) {
          gpState[k] = 1;
        } else {
          gpState[k] = 0;
        }
      });
    };

    const eventEmitter = new NativeEventEmitter();
    PipManager?.setAutoPipEnabled?.(false);
    appStateSubscription.current && appStateSubscription.current.remove();
    appStateSubscription.current = AppState.addEventListener(
      'change',
      async state => {
        if (
          !portraitMode &&
          state === 'background' &&
          isConnected.current &&
          _settings.picture_in_picture
        ) {
          try {
            const enteredPip = await PipManager?.enterPipMode?.();
            if (enteredPip) {
              return;
            }
          } catch (error) {}
        }
      },
    );

    pipEventListener.current = eventEmitter.addListener(
      PICTURE_IN_PICTURE_MODE_CHANGED,
      event => {
        const nextIsInPip = !!event?.isInPictureInPictureMode;
        setIsInPictureInPicture(nextIsInPip);
        if (nextIsInPip) {
          setShowModal(false);
          setShowGamepadEditor(false);
          NativeInputDialog?.dismiss?.();
          macroSequenceTimersRef.current.forEach(timeoutId =>
            clearTimeout(timeoutId),
          );
          macroSequenceTimersRef.current = [];
          closeSystemKeyboardModal();
        }
      },
    );

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
          // e.g. {"controllerIndex": 0, "deviceId": 31, "keyCode": 100}
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (_settings.short_trigger) {
              targetState[keyName] = 1;
            }
          } else {
            targetState[keyName] = 1;
          }
        },
      );

      gpUpEventListener.current = eventEmitter.addListener(
        'onGamepadKeyUp',
        event => {
          // console.log('onGamepadKeyUp:', event);
          const keyCode = event.keyCode;
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (_settings.short_trigger) {
              targetState[keyName] = 0;
            }
          } else {
            targetState[keyName] = 0;
          }
        },
      );

      const syncDpadState = (pressedKeys, gamepadIndex = 0) => {
        const activeKeys = new Set(pressedKeys ?? []);
        const _gpMaping = _settings.native_gamepad_maping ?? defaultMaping;
        const targetState = resolveGamepadState(gamepadIndex);
        if (!targetState) {
          return;
        }

        ['DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight'].forEach(direction => {
          const keyCode = _gpMaping[direction];
          const keyName = gpMaping[keyCode];
          if (!keyName) {
            return;
          }
          targetState[keyName] = activeKeys.has(keyCode) ? 1 : 0;
        });
      };

      dpDownEventListener.current = eventEmitter.addListener(
        'onDpadKeyDown',
        event => {
          // console.log('onDpadKeyDown:', event);
          const pressedKeys = Array.isArray(event.dpadIdxList)
            ? event.dpadIdxList
            : event.dpadIdx >= 0
            ? [event.dpadIdx]
            : [];
          syncDpadState(pressedKeys, event.gamepadIndex);
        },
      );

      dpUpEventListener.current = eventEmitter.addListener(
        'onDpadKeyUp',
        event => {
          // console.log('onDpadKeyUp:', event);
          syncDpadState([], event.gamepadIndex);
        },
      );

      stickEventListener.current = eventEmitter.addListener(
        'onStickMove',
        event => {
          // console.log('onStickMove:', event);
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

          targetState.LeftThumbXAxis = normaliseAxis(event.leftStickX);
          targetState.LeftThumbYAxis = normaliseAxis(event.leftStickY);

          if (
            Math.abs(event.rightStickX) > 0.1 ||
            Math.abs(event.rightStickY) > 0.1
          ) {
            isRightstickMoving.current = true;
          } else {
            isRightstickMoving.current = false;
          }

          targetState.RightThumbXAxis = normaliseAxis(event.rightStickX);
          targetState.RightThumbYAxis = normaliseAxis(event.rightStickY);
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          const targetState = resolveGamepadState(event.gamepadIndex);
          if (!targetState) {
            return;
          }

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
              targetState.LeftTrigger = 1;
            } else {
              setTimeout(() => {
                targetState.LeftTrigger = 0;
              }, 16);
            }
          } else {
            // Line trigger
            if (event.leftTrigger >= 0.05) {
              targetState.LeftTrigger = event.leftTrigger;
            } else {
              setTimeout(() => {
                targetState.LeftTrigger = 0;
              }, 16);
            }
          }

          // Short trigger
          if (_settings.short_trigger) {
            triggerMax = _settings.dead_zone;
            if (event.rightTrigger >= triggerMax) {
              targetState.RightTrigger = 1;
            } else {
              setTimeout(() => {
                targetState.RightTrigger = 0;
              }, 16);
            }
          } else {
            // Line trigger
            if (event.rightTrigger >= 0.05) {
              targetState.RightTrigger = event.rightTrigger;
            } else {
              setTimeout(() => {
                targetState.RightTrigger = 0;
              }, 16);
            }
          }
        },
      );

      // Send gamepad state to webrtc
      timer.current = setInterval(() => {
        if (webrtcClient) {
          if (_settings.coop && coopGpStates) {
            webrtcClient.setGamepadState(coopGpStates);
          } else {
            webrtcClient.setGamepadState(gpState);
          }
        }
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
    const beforeRemoveListener = navigation.addListener('beforeRemove', e => {
      stopVibrate();
      if (portraitMode && e.data.action.type === 'GO_BACK') {
        e.preventDefault();
        Alert.alert(t('Warning'), t('Exit stream?'), [
          {
            text: t('Cancel'),
            style: 'cancel',
          },
          {
            text: t('Confirm'),
            style: 'destructive',
            onPress: () => {
              const _streamApi =
                route.params?.streamType === 'cloud'
                  ? xCloudApiRef.current
                  : xHomeApiRef.current;
              const dest =
                route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
              isRequestExit.current = true;
              setLoading(true);
              setLoadingText(t('Disconnecting...'));
              setIsExiting(true);
              webrtcClient && webrtcClient.close();
              markOrientationForRestore();
              if (_streamApi) {
                _streamApi
                  .stopStream()
                  .then(() => {
                    setIsExiting(false);
                    FullScreenManager.immersiveModeOff();
                    navigation.navigate({
                      name: dest,
                      params: {needRefresh: true},
                    });
                  })
                  .catch(() => {
                    setIsExiting(false);
                    FullScreenManager.immersiveModeOff();
                    navigation.navigate({
                      name: dest,
                      params: {needRefresh: true},
                    });
                  });
              } else {
                setIsExiting(false);
                FullScreenManager.immersiveModeOff();
                navigation.navigate({
                  name: dest,
                  params: {needRefresh: true},
                });
              }
            },
          },
        ]);
        return;
      }
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
                markOrientationForRestore();
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
      webrtcClient.setMaxTouchPoints(_settings.native_touch ? 10 : 0);
      webrtcClient.setSupportedSystemUis(supportedSystemUis);
      webrtcClient.setSystemUiHandler(
        Platform.isTV ? undefined : handleSystemUiEvent,
      );
      webrtcClient.setMessageHandler(handleStreamingMessage);

      if (_settings.coop) {
        webrtcClient.setCoop();
      }

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

            if (_settings.coop) {
              setTimeout(() => {
                ToastAndroid.show(t('CoopTips'), ToastAndroid.SHORT);
              }, 3000);
            }
          }
          setLoadingText(`${t(CONNECTED)}`);
          setLoading(false);
          isConnected.current = true;
          PipManager?.setAutoPipEnabled?.(
            !portraitMode && !!_settings.picture_in_picture,
          );

          // Alway show virtual gamepad
          if (portraitMode || _settings.show_virtual_gamead) {
            setShowVirtualGamepad(true);
          }

          // Alway show performance
          if (!portraitMode && _settings.show_performance) {
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
            const keepaliveIntervalMs =
              streamApi?.getKeepaliveIntervalMs?.() ?? 20 * 1000;
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
            }, keepaliveIntervalMs);
          }

          if (!audioRumbleTimer.current && _settings.enable_audio_rumble) {
            audioRumbleTimer.current = setInterval(() => {
              webrtcClient.getAudioVolume().then(vol => {
                if (vol >= _settings.audio_rumble_threshold) {
                  GamepadManager.vibrate(
                    30,
                    10,
                    0,
                    0,
                    0,
                    _settings.rumble_intensity || 3,
                  );
                }
              });
            }, 16);
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
          const duration = Math.max(
            0,
            Math.min(10000, Math.floor(rumbleData.duration || 0)),
          );
          if (weakMagnitude > 100) {
            weakMagnitude = 100;
          }
          if (strongMagnitude > 100) {
            strongMagnitude = 100;
          }
          if (leftTrigger > 100) {
            leftTrigger = 100;
          }
          if (rightTrigger > 100) {
            rightTrigger = 100;
          }

          const shouldStop =
            weakMagnitude <= 0 &&
            strongMagnitude <= 0 &&
            leftTrigger <= 0 &&
            rightTrigger <= 0;
          if (shouldStop) {
            isRumbling.current = false;
            GamepadManager.vibrate(
              0,
              0,
              0,
              0,
              0,
              _settings.rumble_intensity || 3,
            );
            return;
          }

          isRumbling.current = true;
          GamepadManager.vibrate(
            duration > 0 ? duration : 30,
            weakMagnitude,
            strongMagnitude,
            leftTrigger,
            rightTrigger,
            _settings.rumble_intensity || 3,
          );
        }
      });

      const exit = () => {
        const dest = route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
        setLoading(false);
        webrtcClient && webrtcClient.close();
        markOrientationForRestore();
        streamApi
          .stopStream()
          .then(() => {
            setTimeout(() => {
              setIsExiting(false);
              markOrientationForRestore();
              FullScreenManager.immersiveModeOff();
              navigation.navigate({
                name: dest,
                params: {needRefresh: true},
              });
            }, 500);
          })
          .catch(() => {
            markOrientationForRestore();
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
                  }) - (${route.params?.sessionId}) Fail:` + error;
              } else {
                msg =
                  `[StartSession](${
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home'
                  }) - (${route.params?.sessionId}) Fail:` + e;
              }
            }
            Alert.alert(t('Warning'), msg, [
              {
                text: t('Confirm'),
                style: 'default',
                onPress: () => {
                  markOrientationForRestore();
                  const dest =
                    route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
                  navigation.navigate(dest);
                },
              },
            ]);
          }
        });
    }

    return () => {
      beforeRemoveListener();
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
      appStateSubscription.current && appStateSubscription.current.remove();
      pipEventListener.current && pipEventListener.current.remove();
      PipManager?.setAutoPipEnabled?.(false);
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
      if (audioRumbleTimer.current) {
        clearInterval(audioRumbleTimer.current);
        audioRumbleTimer.current = null;
      }
      macroSequenceTimersRef.current.forEach(timeoutId =>
        clearTimeout(timeoutId),
      );
      macroSequenceTimersRef.current = [];
      GamepadManager.setCurrentScreen('');
      SensorModule.stopSensor();
      GamepadSensorModule.stopSensor();
      closeSystemKeyboardModal();
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
    handleSystemUiEvent,
    handleStreamingMessage,
    closeSystemKeyboardModal,
    markOrientationForRestore,
    supportedSystemUis,
    portraitMode,
  ]);

  React.useEffect(() => {
    if (
      connectState !== CONNECTED ||
      !showPerformance ||
      !webrtcClient ||
      typeof webrtcClient.getStreamState !== 'function'
    ) {
      if (performanceInterval.current) {
        clearInterval(performanceInterval.current);
        performanceInterval.current = null;
      }
      return;
    }

    const updatePerformance = () => {
      webrtcClient
        .getStreamState()
        .then(res => {
          setPerformance(res);
        })
        .catch(() => {});
    };

    updatePerformance();
    performanceInterval.current = setInterval(updatePerformance, 1000);

    return () => {
      if (performanceInterval.current) {
        clearInterval(performanceInterval.current);
        performanceInterval.current = null;
      }
    };
  }, [connectState, showPerformance, webrtcClient]);

  const handlePowerOff = async () => {
    const webApi = new WebApi(webToken);
    const powerOffRes = await webApi.powerOff(route.params?.sessionId);
    console.log('powerOff:', powerOffRes);
  };

  const handleSendMessage = React.useCallback(
    async (rawMessage: string) => {
      const webApi = new WebApi(webToken);
      setMessageSending(true);
      let text = rawMessage.trim();
      if (text.length > 100) {
        text = text.substring(0, 100);
      }
      try {
        await webApi.sendText(route.params?.sessionId, text);
        ToastAndroid.show(t('Sended'), ToastAndroid.SHORT);
      } catch (e) {}
      setMessageSending(false);
    },
    [route.params?.sessionId, t, webToken],
  );

  const openSendTextDialog = React.useCallback(async () => {
    if (messageSending) {
      return;
    }

    const result = await showNativeInputDialog({
      title: t('Send text'),
      hint: t('Text'),
      text: '',
      maxLength: 100,
      confirmText: t('Send'),
      cancelText: t('Cancel'),
    });

    if (result?.action === 'confirm') {
      await handleSendMessage(result.text || '');
    }
  }, [handleSendMessage, messageSending, showNativeInputDialog, t]);

  const handleExit = (off = false) => {
    setLoading(true);
    setLoadingText(t('Disconnecting...'));
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    webrtcClient && webrtcClient.close();
    markOrientationForRestore();
    streamApi.stopStream().then(() => {
      if (off) {
        handlePowerOff();
      }
      setTimeout(() => {
        setIsExiting(false);
        setLoading(false);
        markOrientationForRestore();
        FullScreenManager.immersiveModeOff();
        const dest = route.params?.streamType === 'cloud' ? 'Cloud' : 'Home';
        navigation.navigate({
          name: dest,
          params: {needRefresh: true},
        });
      }, 500);
    });
  };
  handleExitRef.current = handleExit;

  const handleCloseModal = () => {
    setShowModal(false);
    GamepadManager.setCurrentScreen('stream');

    if (!isConnected.current) {
      setLoading(true);
    }
  };

  const clearMacroTimers = () => {
    macroSequenceTimersRef.current.forEach(timeoutId =>
      clearTimeout(timeoutId),
    );
    macroSequenceTimersRef.current = [];
  };

  const runMacroSteps = (rawSteps: any) => {
    const allowedButtons = new Set(VIRTUAL_MACRO_ALLOWED_BUTTONS);
    const steps = normalizeMacroSteps(
      rawSteps,
      DEFAULT_VIRTUAL_MACRO_SHORT_STEPS,
    );
    let accumulatedDelay = 0;

    const schedule = (delay: number, fn: () => void) => {
      const timeoutId = setTimeout(() => {
        fn();
        macroSequenceTimersRef.current = macroSequenceTimersRef.current.filter(
          item => item !== timeoutId,
        );
      }, delay);
      macroSequenceTimersRef.current.push(timeoutId);
    };

    steps.forEach((step: any) => {
      const stepButtons = Array.isArray(step?.buttons)
        ? step.buttons.filter((button: string) =>
            allowedButtons.has(button as any),
          )
        : allowedButtons.has(step?.button as any)
        ? [step.button]
        : [];

      if (!stepButtons.length) {
        return;
      }
      const duration = Math.max(30, Number(step.durationMs) || 80);
      const waitAfter = Math.max(0, Number(step.waitAfterMs) || 0);

      schedule(accumulatedDelay, () => {
        stepButtons.forEach((button: string) => {
          gpState[button] = 1;
        });
      });
      schedule(accumulatedDelay + duration, () => {
        stepButtons.forEach((button: string) => {
          gpState[button] = 0;
        });
      });
      accumulatedDelay += duration + waitAfter;
    });
  };

  const handleMacroPressIn = () => {
    clearMacroTimers();
    const shortSteps = Array.isArray(settings.virtual_macro_short_press_steps)
      ? settings.virtual_macro_short_press_steps
      : [];
    const longSteps = Array.isArray(settings.virtual_macro_long_press_steps)
      ? settings.virtual_macro_long_press_steps
      : [];
    const rawSteps = shortSteps.length ? shortSteps : longSteps;
    runMacroSteps(
      normalizeMacroSteps(rawSteps, DEFAULT_VIRTUAL_MACRO_SHORT_STEPS),
    );

    if (settings.vibration) {
      Vibration.vibrate(20);
    }
  };

  const handleMacroPressOut = () => {};

  // Virtual gamepad press start
  const handleButtonPressIn = name => {
    if (name === VIRTUAL_MACRO_BUTTON_NAME) {
      handleMacroPressIn();
      return;
    }

    // Hold button
    const hold_buttons = settings.hold_buttons || [];
    if (hold_buttons.includes(name)) {
      gpState[name] = gpState[name] === 1 ? 0 : 1;
      return;
    }
    gpState[name] = 1;

    if (settings.vibration) {
      Vibration.vibrate(30);
    }
  };

  // Virtual gamepad press end
  const handleButtonPressOut = name => {
    if (name === VIRTUAL_MACRO_BUTTON_NAME) {
      handleMacroPressOut();
      return;
    }

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
      leveledY = leveledY.toFixed(2);
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
    clearMacroTimers();
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

  const handleToggleMic = async () => {
    if (!webrtcClient) {
      return;
    }

    const chatChannel = webrtcClient.getChannelProcessor('chat');

    if (chatChannel.isPaused === true) {
      const started = await chatChannel.startMic();
      setOpenMicro(Boolean(started));

      if (!started) {
        Alert.alert(
          t('Warning'),
          'Failed to open microphone. Please check microphone permission.',
        );
      }
    } else {
      chatChannel.stopMic();
      setOpenMicro(false);
    }

    handleCloseModal();
  };

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
    if (portraitMode) {
      return null;
    }
    if (isInPictureInPicture || !showVirtualGamepad) {
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
          visible={!portraitMode && showModal && !isInPictureInPicture}
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
                        if (showVirtualGamepad) {
                          clearMacroTimers();
                        }
                        setShowVirtualGamepad(!showVirtualGamepad);
                        handleCloseModal();
                      }}
                    />
                  )}

                  {connectState === CONNECTED && showVirtualGamepad && (
                    <List.Item
                      title={t('Edit Virtual Gamepad')}
                      background={background}
                      onPress={() => {
                        handleCloseModal();
                        handleOpenGamepadEditor();
                      }}
                    />
                  )}

                  {connectState === CONNECTED && settings.enable_microphone && (
                    <List.Item
                      title={
                        openMicro ? t('Close Microphone') : t('Open Microphone')
                      }
                      background={background}
                      onPress={handleToggleMic}
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
                          handleCloseModal();
                          openSendTextDialog();
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
    if (!portraitMode && showPerformance && !isInPictureInPicture) {
      return <PerfPanel performance={performance} />;
    } else {
      return null;
    }
  };

  const renderMenu = () => {
    if (!portraitMode && settings.show_menu && !isInPictureInPicture) {
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

  const useFsrRenderer = !!settings.fsr;
  const fsrSharpness = settings.fsr_display_options?.sharpness ?? 2;
  const handleNativePointerInput = React.useCallback(
    (event: PointerWireData) => {
      if (!webrtcClient || !settings.native_touch) {
        return;
      }

      webrtcClient.getChannelProcessor('input')?.queuePointerInput([event]);
    },
    [settings.native_touch, webrtcClient],
  );

  const video_format = settings.native_touch ? '' : settings.video_format;
  const loadingPosterUrl =
    typeof route.params?.postUrl === 'string' ? route.params.postUrl : '';
  const showLoadingPoster = loading && !!loadingPosterUrl;
  const portraitSafeTop =
    portraitMode && Platform.OS === 'android'
      ? StatusBar.currentHeight || 0
      : 0;
  const portraitVideoHeight = Math.round((screenWidth * 9) / 16);

  const renderStreamPlayer = (containerStyle: any, playerStyle: any) => {
    if (showLoadingPoster || !remoteStream.current?.toURL()) {
      return null;
    }

    const objectFit = video_format === 'Zoom' ? 'cover' : 'contain';

    if (useFsrRenderer) {
      return (
        <View style={containerStyle}>
          <RTCFsrView
            style={playerStyle}
            zOrder={9}
            objectFit={objectFit}
            streamURL={remote}
            videoFormat={video_format || ''}
            fsrEnabled={true}
            fsrSharpness={fsrSharpness}
          />
          <NativeTouchOverlay
            enabled={!!settings.native_touch && !isInPictureInPicture}
            videoFormat={video_format || ''}
            onPointerInput={handleNativePointerInput}
          />
        </View>
      );
    }

    return (
      <View style={containerStyle}>
        <RTCView
          style={playerStyle}
          zOrder={9}
          objectFit={objectFit}
          streamURL={remote}
          videoFormat={video_format || ''}
        />
        <NativeTouchOverlay
          enabled={!!settings.native_touch && !isInPictureInPicture}
          videoFormat={video_format || ''}
          onPointerInput={handleNativePointerInput}
        />
      </View>
    );
  };

  const renderPortraitButton = (name: string, style: any) => (
    <GamepadButton
      name={name}
      style={style}
      onPressIn={handleButtonPressIn}
      onPressOut={handleButtonPressOut}
    />
  );

  const renderPortraitVirtualGamepad = () => {
    if (!portraitMode || connectState !== CONNECTED) {
      return null;
    }

    return (
      <View style={styles.portraitGamepad} pointerEvents="box-none">
        <View style={styles.portraitTriggerRow}>
          {renderPortraitButton('LeftTrigger', styles.portraitTriggerButton)}
          {renderPortraitButton('RightTrigger', styles.portraitTriggerButton)}
        </View>

        <View style={styles.portraitBumperRow}>
          {renderPortraitButton('LeftShoulder', styles.portraitBumperButton)}
          {renderPortraitButton('RightShoulder', styles.portraitBumperButton)}
        </View>

        <View style={styles.portraitMainRow}>
          <View style={styles.portraitDPadCluster}>
            {renderPortraitButton('DPadUp', styles.portraitDPadUp)}
            {renderPortraitButton('DPadLeft', styles.portraitDPadLeft)}
            {renderPortraitButton('DPadDown', styles.portraitDPadDown)}
            {renderPortraitButton('DPadRight', styles.portraitDPadRight)}
          </View>

          <View style={styles.portraitSystemCluster}>
            <View style={styles.portraitSystemRow}>
              {renderPortraitButton('View', styles.portraitSystemButton)}
              {renderPortraitButton('Menu', styles.portraitSystemButton)}
            </View>
            {renderPortraitButton('Nexus', styles.portraitNexus)}
          </View>

          <View style={styles.portraitFaceCluster}>
            {renderPortraitButton('Y', styles.portraitButtonY)}
            {renderPortraitButton('X', styles.portraitButtonX)}
            {renderPortraitButton('B', styles.portraitButtonB)}
            {renderPortraitButton('A', styles.portraitButtonA)}
          </View>
        </View>

        <View style={styles.portraitStickRow}>
          <View style={styles.portraitStickColumn}>
            {renderPortraitButton('LeftThumb', styles.portraitStickThumb)}
            <View style={styles.portraitStickBlock}>
              <AnalogStick
                style={styles.portraitAnalogStick}
                radius={110}
                handleRadius={70}
                onStickChange={(data: any) => handleStickMove('left', data)}
              />
            </View>
          </View>
          <View style={styles.portraitStickColumn}>
            {renderPortraitButton('RightThumb', styles.portraitStickThumb)}
            <View style={styles.portraitStickBlock}>
              <AnalogStick
                style={styles.portraitAnalogStick}
                radius={110}
                handleRadius={70}
                onStickChange={(data: any) => handleStickMove('right', data)}
              />
            </View>
          </View>
        </View>
      </View>
    );
  };

  const confirmPortraitExit = () => {
    Alert.alert(t('Warning'), t('Exit stream?'), [
      {
        text: t('Cancel'),
        style: 'cancel',
      },
      {
        text: t('Confirm'),
        style: 'destructive',
        onPress: () => requestExit(false),
      },
    ]);
  };

  if (portraitMode) {
    return (
      <View style={styles.portraitContainer}>
        {showLoadingPoster && (
          <View style={styles.loadingPosterContainer} pointerEvents="none">
            <Image
              source={{uri: loadingPosterUrl}}
              style={styles.loadingPosterBackdrop}
              resizeMode="cover"
              blurRadius={8}
            />
            <Image
              source={{uri: loadingPosterUrl}}
              style={styles.loadingPoster}
              resizeMode="contain"
            />
            <View style={styles.loadingPosterMask} />
          </View>
        )}

        {loading && (
          <Spinner
            loading={true}
            text={loadingText}
            textStyle={
              showLoadingPoster ? styles.loadingSpinnerText : undefined
            }
            cancelable={true}
            closeCb={() => {
              setLoading(false);
              confirmPortraitExit();
            }}
          />
        )}

        <View
          style={[
            styles.portraitVideoFrame,
            {
              height: portraitVideoHeight,
              marginTop: portraitSafeTop,
            },
          ]}>
          {renderStreamPlayer(
            styles.portraitPlayerContainer,
            styles.portraitPlayer,
          )}
        </View>

        <View style={styles.portraitControls}>
          {renderPortraitVirtualGamepad()}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showLoadingPoster && !isInPictureInPicture && (
        <View style={styles.loadingPosterContainer} pointerEvents="none">
          <Image
            source={{uri: loadingPosterUrl}}
            style={styles.loadingPosterBackdrop}
            resizeMode="cover"
            blurRadius={8}
          />
          <Image
            source={{uri: loadingPosterUrl}}
            style={styles.loadingPoster}
            resizeMode="contain"
          />
          <View style={styles.loadingPosterMask} />
        </View>
      )}

      {loading && !isInPictureInPicture && (
        <Spinner
          loading={true}
          text={loadingText}
          textStyle={showLoadingPoster ? styles.loadingSpinnerText : undefined}
          cancelable={true}
          closeCb={() => {
            setLoading(false);
            setShowModal(true);
          }}
        />
      )}

      {renderStreamPlayer(styles.playerContainer, styles.player)}

      {renderPerformancePanel()}

      {renderVirtualGamepad()}

      <VirtualGamepadEditor
        visible={!portraitMode && showGamepadEditor && !isInPictureInPicture}
        profileName={editorProfile || getActiveProfileName()}
        onSave={handleSaveGamepadLayout}
        onCancel={() => setShowGamepadEditor(false)}
      />

      {renderOptionsModal()}

      {renderMenu()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loadingPosterContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPosterBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingPosterMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  loadingPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingSpinnerText: {
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  playerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  player: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  portraitContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  portraitVideoFrame: {
    width: '100%',
    backgroundColor: 'black',
  },
  portraitPlayerContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  portraitPlayer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'black',
  },
  portraitControls: {
    flex: 1,
    backgroundColor: '#050505',
  },
  portraitGamepad: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 14,
    justifyContent: 'flex-start',
  },
  portraitTriggerRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portraitTriggerButton: {
    width: 58,
    height: 52,
    opacity: 0.72,
  },
  portraitBumperRow: {
    height: 46,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portraitBumperButton: {
    width: 52,
    height: 46,
    opacity: 0.72,
  },
  portraitDPadUp: {
    position: 'absolute',
    left: 48,
    top: 8,
    width: 48,
    height: 48,
    opacity: 0.72,
  },
  portraitDPadLeft: {
    position: 'absolute',
    left: 4,
    top: 52,
    width: 48,
    height: 48,
    opacity: 0.72,
  },
  portraitDPadDown: {
    position: 'absolute',
    left: 48,
    top: 96,
    width: 48,
    height: 48,
    opacity: 0.72,
  },
  portraitDPadRight: {
    position: 'absolute',
    left: 92,
    top: 52,
    width: 48,
    height: 48,
    opacity: 0.72,
  },
  portraitButtonY: {
    position: 'absolute',
    left: 42,
    top: 0,
    opacity: 0.78,
  },
  portraitButtonX: {
    position: 'absolute',
    left: 0,
    top: 44,
    opacity: 0.78,
  },
  portraitButtonB: {
    position: 'absolute',
    right: 0,
    top: 44,
    opacity: 0.78,
  },
  portraitButtonA: {
    position: 'absolute',
    left: 42,
    top: 88,
    opacity: 0.78,
  },
  portraitMainRow: {
    height: 144,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  portraitDPadCluster: {
    width: 144,
    height: 144,
    position: 'relative',
  },
  portraitSystemCluster: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitSystemRow: {
    width: 72,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  portraitSystemButton: {
    width: 34,
    height: 34,
    opacity: 0.68,
  },
  portraitNexus: {
    width: 54,
    height: 54,
    marginTop: 8,
    opacity: 0.68,
  },
  portraitFaceCluster: {
    width: 154,
    height: 148,
    position: 'relative',
  },
  portraitStickRow: {
    height: 160,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  portraitStickColumn: {
    width: 118,
    height: 160,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  portraitStickBlock: {
    width: 118,
    height: 118,
    borderRadius: 59,
    overflow: 'hidden',
  },
  portraitStickThumb: {
    width: 40,
    height: 40,
    marginBottom: 2,
    opacity: 0.68,
    zIndex: 2,
  },
  portraitAnalogStick: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
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

function NativeStreamScreen(props: NativeStreamScreenProps) {
  return <NativeStreamScreenBase {...props} />;
}

export default NativeStreamScreen;
