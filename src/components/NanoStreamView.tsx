import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  ForwardRefRenderFunction,
} from 'react';
import {
  Platform,
  requireNativeComponent,
  UIManager,
  findNodeHandle,
  View,
  ViewProps,
  ViewStyle,
  NativeSyntheticEvent,
} from 'react-native';

type NanoStreamStateEvent = NativeSyntheticEvent<{
  reason: string;
  surfaceReady: boolean;
  surfaceWidth: number;
  surfaceHeight: number;
  sessionId: string;
  streamType: string;
  renderEngine: string;
  statusText: string;
  hasWebToken: boolean;
  hasStreamingTokens: boolean;
  authContextReady: boolean;
  queuedVideoFrames?: number;
  renderedVideoFrames?: number;
  queuedVideoBytes?: number;
  videoWidth?: number;
  videoHeight?: number;
  queuedAudioFrames?: number;
  decodedAudioBuffers?: number;
}>;

type NanoRumbleEvent = NativeSyntheticEvent<{
  startDelay: number;
  duration: number;
  weakMagnitude: number;
  strongMagnitude: number;
  leftTrigger: number;
  rightTrigger: number;
  delayMs: number;
  repeat: number;
}>;

type NativeProps = ViewProps & {
  style?: ViewStyle;
  streamInfo?: any;
  showStatus?: boolean;
  statusText?: string;
  onNativeStateChange?: (event: NanoStreamStateEvent) => void;
  onNanoRumble?: (event: NanoRumbleEvent) => void;
};

type RefApi = {
  startSession: () => void;
  stopSession: () => void;
  requestFocus: () => void;
  setStatusText: (text: string) => void;
  sendGamepadState: (state: any) => void;
};

const NanoStreamViewNative =
  Platform.OS === 'android'
    ? requireNativeComponent<NativeProps>('NanoStreamView')
    : View;

const NanoStreamView: ForwardRefRenderFunction<RefApi, NativeProps> = (
  props,
  ref,
) => {
  const viewRef = useRef(null);

  const dispatchCommand = React.useCallback(
    (commandName: string, args: any[] = []) => {
      if (Platform.OS !== 'android' || !viewRef.current) {
        console.log('[Nano] dispatch skipped', {
          commandName,
          platform: Platform.OS,
          hasView: !!viewRef.current,
        });
        return;
      }
      const viewId = findNodeHandle(viewRef.current);
      if (viewId == null) {
        console.log('[Nano] dispatch skipped no viewId', commandName);
        return;
      }
      const nativeConfig = UIManager.getViewManagerConfig('NanoStreamView');
      const commands = nativeConfig?.Commands;
      const commandId = commands?.[commandName];
      if (commandId == null) {
        console.log('[Nano] dispatch skipped missing command', {
          commandName,
          commands,
        });
        return;
      }
      // console.log('[Nano] dispatch command', {commandName, commandId, args});
      UIManager.dispatchViewManagerCommand(viewId, commandId, args);
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    startSession: () => dispatchCommand('startSession'),
    stopSession: () => dispatchCommand('stopSession'),
    requestFocus: () => dispatchCommand('requestFocus'),
    setStatusText: (text: string) => dispatchCommand('setStatusText', [text]),
    sendGamepadState: (state: any) =>
      dispatchCommand('sendGamepadState', [state]),
  }));

  if (Platform.OS !== 'android') {
    return <View ref={viewRef} style={props.style} />;
  }

  return <NanoStreamViewNative ref={viewRef} {...props} />;
};

export default forwardRef(NanoStreamView);
