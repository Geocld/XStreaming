import React from 'react';
import {TouchableOpacity, View} from 'react-native';
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
    .maxDistance(0)
    .minDuration(10);

  return (
    <GestureDetector gesture={longPressGesture}>
      <TouchableOpacity style={style}>
        <SvgXml xml={icons[name]} width="40" height="40" />
      </TouchableOpacity>
    </GestureDetector>
  );
};

export default GamepadButton;
