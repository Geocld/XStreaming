import React from 'react';
import {
  Alert,
  BackHandler,
  NativeEventEmitter,
  NativeModules,
  StyleSheet,
  ToastAndroid,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import {useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';

import {GAMEPAD_MAPING} from '../common';
import {XBOX_360_GAMEPAD_MAPING} from '../common/usbGamepadMaping';
import NanoStreamView from '../components/NanoStreamView';
import PerfPanel from '../components/PerfPanel';
import Spinner from '../components/Spinner';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import {VIRTUAL_MACRO_BUTTON_NAME} from '../utils/virtualMacro';

const {FullScreenManager, GamepadManager, NativeInputDialog, UsbRumbleManager} =
  NativeModules;
const CONNECT_TIMEOUT_MS = 45 * 1000;
const DUALSENSE = 'DualSenseController';
const MSAL = 'msal';

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

const isFiniteNumber = (value: any) =>
  typeof value === 'number' && Number.isFinite(value);

const positiveStat = (value: any) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0
    ? numberValue
    : undefined;
};

const formatMs = (value: any) => {
  const stat = positiveStat(value);
  if (stat === undefined) {
    return undefined;
  }
  return `${Math.round(stat)}ms`;
};

const formatMbps = (value: any) => {
  const stat = positiveStat(value);
  if (stat === undefined) {
    return undefined;
  }
  return `${stat.toFixed(1)} Mbps`;
};

const formatCountPercent = (count: any, total: any, percent?: any) => {
  const countStat = positiveStat(count);
  if (countStat === undefined) {
    return undefined;
  }
  const totalStat = positiveStat(total);
  const percentStat = positiveStat(percent);
  const computedPercent =
    percentStat ??
    (totalStat !== undefined && totalStat + countStat > 0
      ? (countStat * 100) / (totalStat + countStat)
      : 0);
  return `${Math.round(countStat)} (${computedPercent.toFixed(2)}%)`;
};

const createNanoInputState = () => ({
  buttons: {} as Record<string, number>,
  sticks: {
    left: {x: 0, y: 0},
    right: {x: 0, y: 0},
  },
});

const buildNanoGamepadState = (state: any) => ({
  GamepadIndex: 0,
  Nexus: Number(state.buttons.Nexus || 0),
  Menu: Number(state.buttons.Menu || 0),
  View: Number(state.buttons.View || 0),
  A: Number(state.buttons.A || 0),
  B: Number(state.buttons.B || 0),
  X: Number(state.buttons.X || 0),
  Y: Number(state.buttons.Y || 0),
  DPadUp: Number(state.buttons.DPadUp || 0),
  DPadDown: Number(state.buttons.DPadDown || 0),
  DPadLeft: Number(state.buttons.DPadLeft || 0),
  DPadRight: Number(state.buttons.DPadRight || 0),
  LeftShoulder: Number(state.buttons.LeftShoulder || 0),
  RightShoulder: Number(state.buttons.RightShoulder || 0),
  LeftThumb: Number(state.buttons.LeftThumb || 0),
  RightThumb: Number(state.buttons.RightThumb || 0),
  LeftThumbXAxis: Number(state.sticks.left.x || 0),
  LeftThumbYAxis: Number(state.sticks.left.y || 0),
  RightThumbXAxis: Number(state.sticks.right.x || 0),
  RightThumbYAxis: Number(state.sticks.right.y || 0),
  LeftTrigger: Number(state.buttons.LeftTrigger || 0),
  RightTrigger: Number(state.buttons.RightTrigger || 0),
});

function NanoStreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const viewRef = React.useRef<any>(null);
  const nativeStateRef = React.useRef<any>(null);
  const inputStateRef = React.useRef(createNanoInputState());
  const isExitingRef = React.useRef(false);
  const isConnectedRef = React.useRef(false);
  const errorAlertShownRef = React.useRef(false);
  const optionsDialogOpenRef = React.useRef(false);
  const gamepadTimerRef = React.useRef<any>(null);
  const usbGpEventListener = React.useRef<any>(undefined);
  const gpDownEventListener = React.useRef<any>(undefined);
  const gpUpEventListener = React.useRef<any>(undefined);
  const dpDownEventListener = React.useRef<any>(undefined);
  const dpUpEventListener = React.useRef<any>(undefined);
  const stickEventListener = React.useRef<any>(undefined);
  const triggerEventListener = React.useRef<any>(undefined);
  const isTriggerWorkRef = React.useRef(false);
  const isRumblingRef = React.useRef(false);
  const manualLeftThumbPressedRef = React.useRef(false);
  const autoSprintLeftThumbPressedRef = React.useRef(false);
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const webToken = useSelector((state: any) => state.webToken);
  const streamType = route.params?.streamType === 'cloud' ? 'cloud' : 'home';
  const settings = React.useMemo(
    () => route.params?.settings ?? {},
    [route.params?.settings],
  );
  const showStatus = !!settings.debug;
  const [loading, setLoading] = React.useState(true);
  const [loadingText, setLoadingText] = React.useState(t('Connecting...'));
  const [fatalError, setFatalError] = React.useState('');
  const [isExiting, setIsExiting] = React.useState(false);
  const [performance, setPerformance] = React.useState<any>({});
  const [connectUserToken, setConnectUserToken] = React.useState('');
  const [showPerformance, setShowPerformance] = React.useState(
    !!settings.show_performance,
  );
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(
    !!settings.show_virtual_gamead,
  );
  const selectedStreamingToken = React.useMemo(() => {
    return streamType === 'cloud'
      ? streamingTokens?.xCloudToken
      : streamingTokens?.xHomeToken;
  }, [streamType, streamingTokens?.xCloudToken, streamingTokens?.xHomeToken]);
  const selectedBaseUri = React.useMemo(() => {
    const defaultRegion = selectedStreamingToken?.getDefaultRegion?.();
    if (defaultRegion?.baseUri) {
      return defaultRegion.baseUri;
    }

    const regions =
      selectedStreamingToken?.data?.offeringSettings?.regions ?? [];
    const fallbackRegion =
      regions.find((region: any) => region?.isDefault) ?? regions[0];
    return fallbackRegion?.baseUri ?? selectedStreamingToken?.data?.baseUri ?? '';
  }, [selectedStreamingToken]);
  const selectedGsToken = React.useMemo(
    () => selectedStreamingToken?.data?.gsToken ?? '',
    [selectedStreamingToken],
  );
  const playerFrameStyle = React.useMemo(() => {
    const maxWidth = Math.max(1, windowWidth, windowHeight);
    const maxHeight = Math.max(1, Math.min(windowWidth, windowHeight));
    const targetRatio = 16 / 9;
    const windowRatio = maxWidth / maxHeight;
    if (windowRatio > targetRatio) {
      return {
        width: maxHeight * targetRatio,
        height: maxHeight,
      };
    }
    return {
      width: maxWidth,
      height: maxWidth / targetRatio,
    };
  }, [windowHeight, windowWidth]);

  const streamInfo = React.useMemo(
    () => ({
      sessionId: route.params?.sessionId ?? '',
      streamType,
      render_engine: settings.render_engine ?? 'nano',
      settings,
      postUrl: route.params?.postUrl ?? '',
      baseUri: selectedBaseUri,
      gsToken: selectedGsToken,
      isUsbMode: !!route.params?.isUsbMode,
      usbController: route.params?.usbController ?? '',
      auth: {
        webToken: webToken ?? null,
        connectUserToken,
        streamingTokens: streamingTokens ?? null,
      },
    }),
    [
      route.params?.sessionId,
      route.params?.postUrl,
      route.params?.isUsbMode,
      route.params?.usbController,
      selectedBaseUri,
      selectedGsToken,
      streamType,
      settings,
      connectUserToken,
      streamingTokens,
      webToken,
    ],
  );

  React.useEffect(() => {
    console.log('[Nano] screen mount', {
      sessionId: streamInfo.sessionId,
      streamType: streamInfo.streamType,
      renderEngine: streamInfo.render_engine,
      hasPostUrl: !!streamInfo.postUrl,
      hasBaseUri: !!streamInfo.baseUri,
      hasGsToken: !!streamInfo.gsToken,
      hasConnectUserToken: !!streamInfo.auth.connectUserToken,
      isUsbMode: streamInfo.isUsbMode,
      hasWebToken: !!streamInfo.auth.webToken,
      hasStreamingTokens: !!streamInfo.auth.streamingTokens,
    });

    return () => {
      console.log('[Nano] screen unmount', {
        sessionId: streamInfo.sessionId,
        streamType: streamInfo.streamType,
      });
    };
  }, [
    streamInfo.auth.streamingTokens,
    streamInfo.auth.webToken,
    streamInfo.isUsbMode,
    streamInfo.baseUri,
    streamInfo.gsToken,
    streamInfo.auth.connectUserToken,
    streamInfo.postUrl,
    streamInfo.render_engine,
    streamInfo.sessionId,
    streamInfo.streamType,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    const loadConnectUserToken = async () => {
      if (!authentication) {
        setFatalError('[Nano] authentication context missing');
        return;
      }

      try {
        authentication._tokenStore?.load?.();
        const authMethod =
          authentication._tokenStore?.getAuthenticationMethod?.();
        let msalToken;
        if (authMethod === MSAL && authentication._msal) {
          msalToken = await authentication._msal.getMsalToken();
        } else if (authentication._xal) {
          msalToken = await authentication._xal.getMsalToken(
            authentication._tokenStore,
          );
        } else if (authentication._msal) {
          msalToken = await authentication._msal.getMsalToken();
        }

        const lpt = msalToken?.data?.lpt;
        if (!lpt) {
          throw new Error('MSAL transfer token is empty');
        }
        if (!cancelled) {
          console.log('[Nano] connect user token loaded', {
            streamType,
            authMethod,
          });
          setConnectUserToken(lpt);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.log('[Nano] connect user token failed', error);
          setFatalError(
            error?.message
              ? `[Nano] connect token failed: ${error.message}`
              : '[Nano] connect token failed',
          );
        }
      }
    };

    setConnectUserToken('');
    loadConnectUserToken();

    return () => {
      cancelled = true;
    };
  }, [authentication, streamType]);

  React.useEffect(() => {
    setShowPerformance(!!settings.show_performance);
    setShowVirtualGamepad(!!settings.show_virtual_gamead);
  }, [settings.show_performance, settings.show_virtual_gamead]);

  const sendGamepadState = React.useCallback(() => {
    const nativeView = viewRef.current;
    if (!nativeView?.sendGamepadState) {
      return;
    }
    nativeView.sendGamepadState(buildNanoGamepadState(inputStateRef.current));
  }, []);

  const handleExit = React.useCallback(() => {
    if (isExitingRef.current) {
      return;
    }
    isExitingRef.current = true;
    console.log('[Nano] exit requested', {
      sessionId: streamInfo.sessionId,
      streamType,
      hasView: !!viewRef.current,
    });
    setIsExiting(true);
    setLoading(true);
    setLoadingText(t('Disconnecting...'));
    viewRef.current?.stopSession?.();
    Orientation.unlockAllOrientations();
    FullScreenManager?.immersiveModeOff?.();
    GamepadManager?.setCurrentScreen?.('');

    const dest = streamType === 'cloud' ? 'Cloud' : 'Home';
    navigation.navigate({
      name: dest,
      params: {needRefresh: true},
    });
  }, [navigation, streamInfo.sessionId, streamType, t]);

  const sendNexusPress = React.useCallback(
    (durationMs: number) => {
      inputStateRef.current.buttons.Nexus = 1;
      sendGamepadState();
      setTimeout(() => {
        inputStateRef.current.buttons.Nexus = 0;
        sendGamepadState();
      }, durationMs);
    },
    [sendGamepadState],
  );

  const showNativeOptionsDialog = React.useCallback(
    async (items: Array<{id: string; title: string}>) => {
      if (!NativeInputDialog?.showOptions) {
        return null;
      }

      try {
        return await NativeInputDialog.showOptions({items});
      } catch (error) {
        return null;
      }
    },
    [],
  );

  const openOptionsModal = React.useCallback(async () => {
    if (optionsDialogOpenRef.current || isExitingRef.current) {
      return;
    }

    optionsDialogOpenRef.current = true;
    GamepadManager?.setCurrentScreen?.('');

    const items: Array<{id: string; title: string}> = [];
    if (isConnectedRef.current) {
      // items.push({
      //   id: 'togglePerformance',
      //   title: t('Toggle Performance'),
      // });
      items.push({
        id: 'toggleVirtualGamepad',
        title: t('Toggle Virtual Gamepad'),
      });
      items.push({
        id: 'pressNexus',
        title: t('Press Nexus'),
      });
      if (streamType !== 'cloud') {
        items.push({
          id: 'longPressNexus',
          title: t('Long press Nexus'),
        });
      }
    }
    items.push({
      id: 'disconnect',
      title: t('Disconnect'),
    });

    const result = await showNativeOptionsDialog(items);
    optionsDialogOpenRef.current = false;
    GamepadManager?.setCurrentScreen?.('stream');

    if (result?.action !== 'select') {
      return;
    }

    switch (result.id) {
      case 'togglePerformance':
        setShowPerformance(value => !value);
        break;
      case 'toggleVirtualGamepad':
        setShowVirtualGamepad(value => !value);
        break;
      case 'pressNexus':
        sendNexusPress(120);
        break;
      case 'longPressNexus':
        sendNexusPress(1000);
        break;
      case 'disconnect':
        handleExit();
        break;
      default:
        break;
    }
  }, [handleExit, sendNexusPress, showNativeOptionsDialog, streamType, t]);

  React.useEffect(() => {
    const isUsbMode = !!route.params?.isUsbMode;
    const swapMapping = (value: any) =>
      Object.fromEntries(
        Object.entries(value || {}).map(([key, mappedValue]) => [
          mappedValue,
          key,
        ]),
      );
    const baseMapping = isUsbMode
      ? XBOX_360_GAMEPAD_MAPING
      : settings.native_gamepad_maping || GAMEPAD_MAPING;
    const gpMapping: any = swapMapping(baseMapping);
    const eventEmitter = new NativeEventEmitter();
    const pollingRate = Number(settings.polling_rate || 60);
    let triggerMax = 0.8;

    const syncLeftThumbButton = () => {
      inputStateRef.current.buttons.LeftThumb =
        manualLeftThumbPressedRef.current || autoSprintLeftThumbPressedRef.current
          ? 1
          : 0;
    };

    const syncAutoSprint = () => {
      autoSprintLeftThumbPressedRef.current =
        !!settings.auto_sprint &&
        (Math.abs(inputStateRef.current.sticks.left.x) > 0 ||
          Math.abs(inputStateRef.current.sticks.left.y) > 0);
      syncLeftThumbButton();
    };

    const normaliseAxis = (value: number) => {
      let normalized = Number(value || 0);
      const deadZone = Number(settings.dead_zone || 0);
      if (deadZone > 0) {
        if (Math.abs(normalized) < deadZone) {
          return 0;
        }

        normalized = normalized - Math.sign(normalized) * deadZone;
        normalized /= 1.0 - deadZone;

        const threshold = 0.8;
        const compensation = Number(settings.edge_compensation || 0) / 100;
        if (Math.abs(normalized) > threshold) {
          normalized =
            normalized > 0
              ? Math.min(normalized + compensation, 1)
              : Math.max(normalized - compensation, -1);
        }
      }
      return normalized;
    };

    const resetButtonState = () => {
      GAMEPAD_DIGITAL_KEYS.forEach(key => {
        inputStateRef.current.buttons[key] = 0;
      });
      manualLeftThumbPressedRef.current = false;
      autoSprintLeftThumbPressedRef.current = false;
      syncLeftThumbButton();
    };

    const getPressedButtons = (combinedValue: number) => {
      const pressedButtons: string[] = [];
      for (const [button, value] of Object.entries(XBOX_360_GAMEPAD_MAPING)) {
        // eslint-disable-next-line no-bitwise
        if ((combinedValue & (value as number)) === value) {
          pressedButtons.push(button);
        }
      }
      return pressedButtons;
    };

    const setUsbButtons = (combinedKeys: string[]) => {
      manualLeftThumbPressedRef.current = combinedKeys.includes('LeftThumb');
      GAMEPAD_DIGITAL_KEYS.forEach(key => {
        if (key === 'LeftThumb') {
          return;
        }
        inputStateRef.current.buttons[key] = combinedKeys.includes(key) ? 1 : 0;
      });
      syncLeftThumbButton();
    };

    if (isUsbMode) {
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
          } = params || {};

          if (keyCode !== 0) {
            setUsbButtons(getPressedButtons(Number(keyCode || 0)));
          } else {
            resetButtonState();
          }

          inputStateRef.current.buttons.LeftTrigger = Number(leftTrigger || 0);
          inputStateRef.current.buttons.RightTrigger = Number(rightTrigger || 0);
          inputStateRef.current.sticks.left = {
            x: normaliseAxis(Number(leftStickX || 0)),
            y: normaliseAxis(Number(leftStickY || 0)),
          };
          syncAutoSprint();
          inputStateRef.current.sticks.right = {
            x: normaliseAxis(Number(rightStickX || 0)),
            y: normaliseAxis(Number(rightStickY || 0)),
          };
        },
      );
    } else {
      gpDownEventListener.current = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          const keyName = gpMapping[event?.keyCode];
          if (!keyName) {
            return;
          }

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (settings.short_trigger) {
              inputStateRef.current.buttons[keyName] = 1;
            }
          } else {
            inputStateRef.current.buttons[keyName] = 1;
          }
          if (keyName === 'LeftThumb') {
            manualLeftThumbPressedRef.current = true;
            syncLeftThumbButton();
          }
        },
      );

      gpUpEventListener.current = eventEmitter.addListener(
        'onGamepadKeyUp',
        event => {
          const keyName = gpMapping[event?.keyCode];
          if (!keyName) {
            return;
          }

          if (keyName === 'LeftTrigger' || keyName === 'RightTrigger') {
            if (settings.short_trigger) {
              inputStateRef.current.buttons[keyName] = 0;
            }
          } else {
            inputStateRef.current.buttons[keyName] = 0;
          }
          if (keyName === 'LeftThumb') {
            manualLeftThumbPressedRef.current = false;
            syncLeftThumbButton();
          }
        },
      );

      const syncDpadState = (pressedKeys: any[] = []) => {
        const activeKeys = new Set(pressedKeys ?? []);
        ['DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight'].forEach(direction => {
          const keyCode = (baseMapping as any)[direction];
          const keyName = gpMapping[keyCode];
          if (keyName) {
            inputStateRef.current.buttons[keyName] = activeKeys.has(keyCode)
              ? 1
              : 0;
          }
        });
      };

      dpDownEventListener.current = eventEmitter.addListener(
        'onDpadKeyDown',
        event => {
          const pressedKeys = Array.isArray(event?.dpadIdxList)
            ? event.dpadIdxList
            : event?.dpadIdx >= 0
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
          inputStateRef.current.sticks.left = {
            x: normaliseAxis(Number(event?.leftStickX || 0)),
            y: normaliseAxis(Number(event?.leftStickY || 0)),
          };
          syncAutoSprint();
          inputStateRef.current.sticks.right = {
            x: normaliseAxis(Number(event?.rightStickX || 0)),
            y: normaliseAxis(Number(event?.rightStickY || 0)),
          };
        },
      );

      triggerEventListener.current = eventEmitter.addListener(
        'onTrigger',
        event => {
          if (
            !isTriggerWorkRef.current &&
            (event?.leftTrigger > 0 || event?.rightTrigger > 0)
          ) {
            isTriggerWorkRef.current = true;
          }
          if (!isTriggerWorkRef.current) {
            return;
          }

          if (settings.short_trigger) {
            triggerMax = Number(settings.dead_zone || 0.8);
            inputStateRef.current.buttons.LeftTrigger =
              event?.leftTrigger >= triggerMax ? 1 : 0;
            inputStateRef.current.buttons.RightTrigger =
              event?.rightTrigger >= triggerMax ? 1 : 0;
          } else {
            inputStateRef.current.buttons.LeftTrigger =
              event?.leftTrigger >= 0.05 ? Number(event.leftTrigger) : 0;
            inputStateRef.current.buttons.RightTrigger =
              event?.rightTrigger >= 0.05 ? Number(event.rightTrigger) : 0;
          }
        },
      );
    }

    gamepadTimerRef.current = setInterval(() => {
      sendGamepadState();
    }, 1000 / Math.max(1, pollingRate));

    return () => {
      usbGpEventListener.current && usbGpEventListener.current.remove();
      gpDownEventListener.current && gpDownEventListener.current.remove();
      gpUpEventListener.current && gpUpEventListener.current.remove();
      dpDownEventListener.current && dpDownEventListener.current.remove();
      dpUpEventListener.current && dpUpEventListener.current.remove();
      stickEventListener.current && stickEventListener.current.remove();
      triggerEventListener.current && triggerEventListener.current.remove();
      if (gamepadTimerRef.current) {
        clearInterval(gamepadTimerRef.current);
        gamepadTimerRef.current = null;
      }
      manualLeftThumbPressedRef.current = false;
      autoSprintLeftThumbPressedRef.current = false;
      isTriggerWorkRef.current = false;
    };
  }, [
    route.params?.isUsbMode,
    sendGamepadState,
    settings.auto_sprint,
    settings.dead_zone,
    settings.edge_compensation,
    settings.native_gamepad_maping,
    settings.polling_rate,
    settings.short_trigger,
  ]);

  React.useEffect(() => {
    if (!fatalError || errorAlertShownRef.current) {
      return;
    }
    errorAlertShownRef.current = true;
    setLoading(false);
    Alert.alert(t('Warning'), fatalError, [
      {
        text: t('Confirm'),
        style: 'default',
        onPress: () => {
          handleExit();
        },
      },
    ]);
  }, [fatalError, handleExit, t]);

  const handleNativeStateChange = React.useCallback(
    (event: any) => {
      const state = event?.nativeEvent ?? null;
      nativeStateRef.current = state;
      if (!state) {
        return;
      }

      const sessionStatusText = String(state.sessionStatusText || '');
      const statusText = sessionStatusText || String(state.statusText || '');
      const sessionStage = String(state.sessionStage || '');
      if (state.terminalSessionError || sessionStage === 'failed') {
        setFatalError(statusText || t('NAT failed'));
        return;
      }
      if (!isConnectedRef.current && sessionStatusText) {
        const nextLoadingText = t(sessionStatusText);
        setLoadingText(prev =>
          prev === nextLoadingText ? prev : nextLoadingText,
        );
      }

      const renderedVideoFrames = Number(state.renderedVideoFrames || 0);
      const videoWidth = Number(state.videoWidth || 0);
      const videoHeight = Number(state.videoHeight || 0);
      const resolution =
        videoWidth > 0 && videoHeight > 0
          ? `${videoWidth}x${videoHeight}`
          : state.surfaceWidth && state.surfaceHeight
            ? `${state.surfaceWidth}x${state.surfaceHeight}`
            : '';

      if (showPerformance) {
        setPerformance((prev: any) => ({
          ...prev,
          resolution: resolution || prev.resolution,
          rtt: formatMs(state.webRtcRttMs) ?? prev.rtt,
          jit: formatMs(state.webRtcJitterMs) ?? prev.jit,
          fps: isFiniteNumber(state.webRtcFps)
            ? Math.round(Number(state.webRtcFps))
            : prev.fps,
          fl:
            formatCountPercent(
              state.webRtcFramesDropped,
              state.webRtcFramesReceived,
            ) ?? prev.fl,
          pl:
            formatCountPercent(
              state.webRtcPacketsLost,
              state.webRtcPacketsReceived,
              state.webRtcPacketLossPercent,
            ) ?? prev.pl,
          br: formatMbps(state.webRtcBitrateMbps) ?? prev.br,
          decode: formatMs(state.webRtcDecodeMs) ?? prev.decode,
        }));
      }

      if (
        (renderedVideoFrames > 0 || sessionStage === 'connected') &&
        !isConnectedRef.current
      ) {
        isConnectedRef.current = true;
        setLoadingText(t('connected'));
        setLoading(false);
        ToastAndroid.show(t('Connected'), ToastAndroid.SHORT);
        if (settings.show_performance) {
          setShowPerformance(true);
        }
        if (settings.show_virtual_gamead) {
          setShowVirtualGamepad(true);
        }
      }
    },
    [settings.show_performance, settings.show_virtual_gamead, showPerformance, t],
  );

  const handleNanoRumble = React.useCallback(
    (event: any) => {
      const rumbleData = event?.nativeEvent ?? event;
      if (!settings.vibration || !rumbleData) {
        return;
      }

      const isUsbMode = !!route.params?.isUsbMode;
      if (isUsbMode) {
        if (route.params?.usbController === DUALSENSE) {
          let weakMagnitude = Number(rumbleData.weakMagnitude || 0) * 255;
          let strongMagnitude = Number(rumbleData.strongMagnitude || 0) * 255;
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
            strongMagnitude,
            weakMagnitude,
            settings.left_trigger_type || 0,
            settings.left_trigger_effects || [],
            settings.right_trigger_type || 0,
            settings.right_trigger_effects || [],
          );
        } else {
          let weakMagnitude = Number(rumbleData.weakMagnitude || 0) * 32767;
          let strongMagnitude = Number(rumbleData.strongMagnitude || 0) * 32767;
          let leftTrigger = Number(rumbleData.leftTrigger || 0) * 32767;
          let rightTrigger = Number(rumbleData.rightTrigger || 0) * 32767;
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

          if (Number(rumbleData.duration || 0) < 20) {
            setTimeout(() => {
              UsbRumbleManager.rumble(0, 0);
              UsbRumbleManager.rumbleTriggers(0, 0);
            }, 300);
          }
        }
      } else {
        let weakMagnitude = Number(rumbleData.weakMagnitude || 0) * 100;
        let strongMagnitude = Number(rumbleData.strongMagnitude || 0) * 100;
        let leftTrigger = Number(rumbleData.leftTrigger || 0) * 100;
        let rightTrigger = Number(rumbleData.rightTrigger || 0) * 100;
        const duration = Math.max(
          0,
          Math.min(10000, Math.floor(Number(rumbleData.duration || 0))),
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
          isRumblingRef.current = false;
          GamepadManager.vibrate(
            0,
            0,
            0,
            0,
            0,
            settings.rumble_intensity || 3,
          );
          return;
        }

        isRumblingRef.current = true;
        GamepadManager.vibrate(
          duration > 0 ? duration : 30,
          weakMagnitude,
          strongMagnitude,
          leftTrigger,
          rightTrigger,
          settings.rumble_intensity || 3,
        );
      }
    },
    [
      route.params?.isUsbMode,
      route.params?.usbController,
      settings.left_trigger_effects,
      settings.left_trigger_type,
      settings.right_trigger_effects,
      settings.right_trigger_type,
      settings.rumble_intensity,
      settings.vibration,
    ],
  );

  React.useEffect(() => {
    if (!connectUserToken) {
      setLoading(true);
      setLoadingText(t('Connecting...'));
      return () => {};
    }

    Orientation.lockToLandscape();
    FullScreenManager?.immersiveModeOn?.();
    GamepadManager?.setCurrentScreen?.('stream');
    setLoading(true);
    setLoadingText(t('Connecting...'));

    const startNanoSession = (reason: string) => {
      const nativeView = viewRef.current;
      console.log('[Nano] start attempt', {
        reason,
        sessionId: streamInfo.sessionId,
        streamType: streamInfo.streamType,
        hasView: !!nativeView,
      });
      nativeView?.startSession?.();
      nativeView?.requestFocus?.();
    };

    startNanoSession('mount');
    const startTimer = setTimeout(() => startNanoSession('retry'), 300);
    const connectTimeout = setTimeout(() => {
      if (!isConnectedRef.current && !isExitingRef.current) {
        setFatalError('[Nano] connect timeout: no video frame rendered');
      }
    }, CONNECT_TIMEOUT_MS);

    return () => {
      console.log('[Nano] cleanup', {
        sessionId: streamInfo.sessionId,
        hasView: !!viewRef.current,
      });
      clearTimeout(startTimer);
      clearTimeout(connectTimeout);
      viewRef.current?.stopSession?.();
      Orientation.unlockAllOrientations();
      FullScreenManager?.immersiveModeOff?.();
      GamepadManager?.setCurrentScreen?.('');
      inputStateRef.current = createNanoInputState();
    };
  }, [connectUserToken, streamInfo.sessionId, streamInfo.streamType, t]);

  React.useEffect(() => {
    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        openOptionsModal();
        return true;
      },
    );

    return () => {
      backSubscription.remove();
    };
  }, [openOptionsModal]);

  const vibrate = React.useCallback(
    (duration: number) => {
      if (settings.vibration) {
        Vibration.vibrate(duration);
      }
    },
    [settings.vibration],
  );

  const handleButtonPressIn = React.useCallback(
    (name: string) => {
      if (name === VIRTUAL_MACRO_BUTTON_NAME) {
        return;
      }

      if (name === 'LeftThumb') {
        inputStateRef.current.buttons[name] = 1;
        sendGamepadState();
        viewRef.current?.requestFocus?.();
        return;
      }

      const holdButtons = settings.hold_buttons || [];
      inputStateRef.current.buttons[name] = holdButtons.includes(name)
        ? inputStateRef.current.buttons[name] === 1
          ? 0
          : 1
        : 1;
      sendGamepadState();
      viewRef.current?.requestFocus?.();
      vibrate(30);
    },
    [sendGamepadState, settings.hold_buttons, vibrate],
  );

  const handleButtonPressOut = React.useCallback(
    (name: string) => {
      if (name === VIRTUAL_MACRO_BUTTON_NAME) {
        return;
      }

      const holdButtons = settings.hold_buttons || [];
      if (name === 'LeftThumb') {
        if (holdButtons.includes(name)) {
          return;
        }
        setTimeout(() => {
          inputStateRef.current.buttons[name] = 0;
          sendGamepadState();
        }, 50);
        return;
      }

      if (holdButtons.includes(name)) {
        return;
      }
      inputStateRef.current.buttons[name] = 0;
      sendGamepadState();
    },
    [sendGamepadState, settings.hold_buttons],
  );

  const handleStickMove = React.useCallback(
    (id: string, data: any) => {
      const stick = id === 'right' ? 'right' : 'left';
      inputStateRef.current.sticks[stick] = {
        x: Number(data?.x || 0),
        y: Number(data?.y || 0),
      };
      sendGamepadState();
    },
    [sendGamepadState],
  );

  const renderVirtualGamepad = () => {
    if (!showVirtualGamepad) {
      return null;
    }

    const opacity = Number(settings.virtual_gamepad_opacity ?? 0.7);
    const gamepadProps = {
      opacity,
      onPressIn: handleButtonPressIn,
      onPressOut: handleButtonPressOut,
      onStickMove: handleStickMove,
    };

    if (settings.custom_virtual_gamepad) {
      return (
        <CustomVirtualGamepad
          title={settings.custom_virtual_gamepad}
          {...gamepadProps}
        />
      );
    }

    return <VirtualGamepad {...gamepadProps} />;
  };

  return (
    <View style={styles.container}>
      <Spinner
        loading={loading || isExiting}
        text={isExiting ? t('Disconnecting...') : loadingText}
        cancelable={!isExiting}
        closeCb={openOptionsModal}
      />
      <View style={[styles.playerFrame, playerFrameStyle]}>
        <NanoStreamView
          ref={viewRef}
          style={styles.player}
          streamInfo={streamInfo}
          showStatus={showStatus}
          statusText={''}
          onNativeStateChange={handleNativeStateChange}
          onNanoRumble={handleNanoRumble}
        />
      </View>
      {showPerformance && (
        <PerfPanel
          performance={performance}
          streamType={streamType}
        />
      )}
      {renderVirtualGamepad()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerFrame: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  player: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
});

export default NanoStreamScreen;
