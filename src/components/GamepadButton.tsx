import React from 'react';
import {TouchableOpacity} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {SvgXml} from 'react-native-svg';
import icons from '../common/virtualgp';

type Props = {
  name: string;
  style: any;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
};

const GamepadButton: React.FC<Props> = ({
  name,
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

  let width = 40;
  let height = 40;

  if (['A', 'B', 'X', 'Y'].indexOf(name) > -1) {
    width = 70;
    height = 70;
  }
  if (name === 'Nexus') {
    width = 60;
    height = 60;
  }

  return (
    <GestureDetector gesture={longPressGesture}>
      <TouchableOpacity style={style}>
        <SvgXml xml={icons[name]} width={width} height={height} />
      </TouchableOpacity>
    </GestureDetector>
  );
};

export default GamepadButton;
