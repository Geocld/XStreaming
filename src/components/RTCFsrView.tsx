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
};

const NativeRTCFsrVideoView = requireNativeComponent<Props>('RTCFsrVideoView');

const RTCFsrView: React.FC<Props> = props => {
  return <NativeRTCFsrVideoView {...props} />;
};

export default RTCFsrView;
