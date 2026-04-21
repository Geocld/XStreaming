import React from 'react';
import {TouchableOpacity} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {SvgXml} from 'react-native-svg';
import {useTheme} from 'react-native-paper';
import icons from '../common/virtualgp';
import {VIRTUAL_MACRO_BUTTON_NAME} from '../utils/virtualMacro';
import {colorizeMacroIconXml, normalizeHexColor} from '../utils/themeColor';

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
  const theme = useTheme();
  const primaryColor = normalizeHexColor(theme.colors.primary);
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
  if (name === VIRTUAL_MACRO_BUTTON_NAME) {
    width = 60;
    height = 60;
  }

  const xml =
    name === VIRTUAL_MACRO_BUTTON_NAME
      ? colorizeMacroIconXml(icons[name], primaryColor)
      : icons[name];

  return (
    <GestureDetector gesture={longPressGesture}>
      <TouchableOpacity style={style}>
        <SvgXml xml={xml} width={width} height={height} />
      </TouchableOpacity>
    </GestureDetector>
  );
};

export default GamepadButton;
