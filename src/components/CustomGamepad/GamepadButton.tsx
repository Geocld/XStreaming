import React from 'react';
import {TouchableOpacity} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {SvgXml} from 'react-native-svg';
import icons from '../../common/virtualgp';

type Props = {
  name: string;
  width?: number;
  height?: number;
  scale?: number;
  style: any;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
};

const GamepadButton: React.FC<Props> = ({
  name,
  width = 40,
  height = 40,
  scale = 1,
  onPressIn,
  onPressOut,
  style,
}) => {
  const longPressGesture = Gesture.LongPress()
    .onStart(() => {
      onPressIn && onPressIn(name);
    })
    .onEnd(() => {
      onPressOut && onPressOut(name);
    })
    .minDuration(16);

  return (
    <GestureDetector gesture={longPressGesture}>
      <TouchableOpacity style={style}>
        <SvgXml
          xml={icons[name]}
          width={width * scale}
          height={height * scale}
        />
      </TouchableOpacity>
    </GestureDetector>
  );
};

export default GamepadButton;
