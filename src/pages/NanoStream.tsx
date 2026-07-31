import React from 'react';
import {
  Alert,
  BackHandler,
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

import NanoStreamView from '../components/NanoStreamView';
import PerfPanel from '../components/PerfPanel';
import Spinner from '../components/Spinner';
import VirtualGamepad from '../components/VirtualGamepad';
import CustomVirtualGamepad from '../components/CustomVirtualGamepad';
import {VIRTUAL_MACRO_BUTTON_NAME} from '../utils/virtualMacro';

const {FullScreenManager, GamepadManager, NativeInputDialog} = NativeModules;
const CONNECT_TIMEOUT_MS = 45 * 1000;

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
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
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
  const [showPerformance, setShowPerformance] = React.useState(
    !!settings.show_performance,
  );
  const [showVirtualGamepad, setShowVirtualGamepad] = React.useState(
    !!settings.show_virtual_gamead,
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
      isUsbMode: !!route.params?.isUsbMode,
      usbController: route.params?.usbController ?? '',
      auth: {
        webToken: webToken ?? null,
        streamingTokens: streamingTokens ?? null,
      },
    }),
    [
      route.params?.sessionId,
      route.params?.postUrl,
      route.params?.isUsbMode,
      route.params?.usbController,
      streamType,
      settings,
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
    streamInfo.postUrl,
    streamInfo.render_engine,
    streamInfo.sessionId,
    streamInfo.streamType,
  ]);

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
      items.push({
        id: 'togglePerformance',
        title: t('Toggle Performance'),
      });
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
    GamepadManager?.setCurrentScreen?.('nano');

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
        setLoadingText(t(sessionStatusText));
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
    [settings.show_performance, settings.show_virtual_gamead, t],
  );

  React.useEffect(() => {
    Orientation.lockToLandscape();
    FullScreenManager?.immersiveModeOn?.();
    GamepadManager?.setCurrentScreen?.('nano');
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
  }, [streamInfo.sessionId, streamInfo.streamType, t]);

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
