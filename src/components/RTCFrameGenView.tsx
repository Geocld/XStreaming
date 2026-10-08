import React from 'react';
import {
  requireNativeComponent,
  StyleProp,
  ViewStyle,
  ViewProps,
} from 'react-native';

type Props = ViewProps & {
  style?: StyleProp<ViewStyle>;
  streamURL: string;
  objectFit?: 'contain' | 'cover';
  mirror?: boolean;
  zOrder?: number;
  videoFormat?: string;
  fsrEnabled?: boolean;
  fsrSharpness?: number;
  logVerbose?: boolean;
  framegenFp16?: boolean;
  videoFps?: number;
};

const NativeRTCFrameGenVideoView = requireNativeComponent<Props>(
  'RTCFrameGenVideoView',
);

const RTCFrameGenView: React.FC<Props> = props => (
  <NativeRTCFrameGenVideoView {...props} />
);

export default RTCFrameGenView;
