import {requireNativeComponent, ViewProps} from 'react-native';

type NativeStateEvent = {
  nativeEvent: {
    kernel?: string;
    status?: string;
    snapshot?: string;
    sdlStarted?: boolean;
    buttons?: number;
    leftX?: number;
    leftY?: number;
    rightX?: number;
    rightY?: number;
    l2?: number;
    r2?: number;
  };
};

type Props = ViewProps & {
  kernel: 'android' | 'sdl';
  deadZone: number;
  edgeCompensation: number;
  shortTrigger: boolean;
  swapDpad: boolean;
  onState: (event: NativeStateEvent) => void;
};

export default requireNativeComponent<Props>('GamepadTestView');
