import React from 'react';
import ButtonView from '../ButtonView';
import {TouchableOpacity} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {SvgXml} from 'react-native-svg';
import icons from '../../common/virtualgp';
import {VIRTUAL_MACRO_BUTTON_NAME} from '../../utils/virtualMacro';

type Props = {
  name: string;
  width?: number;
  height?: number;
  scale?: number;
  style: any;
  onPressIn: (name: string) => void;
  onPressOut: (name: string) => void;
};

const mapping: any = {
  LeftTrigger: 'control_button_lt',
  RightTrigger: 'control_button_rt',
  LeftShoulder: 'control_button_lb',
  RightShoulder: 'control_button_rb',
  A: 'control_button_a',
  B: 'control_button_b',
  X: 'control_button_x',
  Y: 'control_button_y',
  LeftThumb: 'control_button_left_joystick_down',
  RightThumb: 'control_button_right_joystick_down',
  View: 'control_button_view',
  Nexus: 'control_button_xbox',
  Menu: 'control_button_menu',
  DPadUp: 'control_button_up',
  DPadLeft: 'control_button_left',
  DPadDown: 'control_button_down',
  DPadRight: 'control_button_right',
};

const GamepadButton: React.FC<Props> = ({
  name,
  width = 50,
  height = 50,
  scale = 1,
  onPressIn,
  onPressOut,
  style,
}) => {
  if (['A', 'B', 'X', 'Y'].indexOf(name) > -1) {
    width = 60;
    height = 60;
  }
  if (name.indexOf('DPad') > -1) {
    width = 70;
    height = 70;
  }

  if (name === VIRTUAL_MACRO_BUTTON_NAME) {
    width = 60;
    height = 60;
  }

  const mappedButtonName = mapping[name];
  if (!mappedButtonName) {
    const longPressGesture = Gesture.LongPress()
      .onStart(() => {
        onPressIn(name);
      })
      .onEnd(() => {
        onPressOut(name);
      })
      .minDuration(16);

    return (
      <GestureDetector gesture={longPressGesture}>
        <TouchableOpacity
          style={[
            style,
            {
              width: width * scale,
              height: height * scale,
            },
          ]}>
          <SvgXml
            xml={icons[name] ?? icons.Menu}
            width={width * scale}
            height={height * scale}
          />
        </TouchableOpacity>
      </GestureDetector>
    );
  }

  return (
    <ButtonView
      style={[
        style,
        {
          width: width * scale,
          height: height * scale,
        },
      ]}
      buttonName={mappedButtonName}
      onPressIn={() => onPressIn(name)}
      onPressOut={() => onPressOut(name)}
    />
  );
};

export default GamepadButton;
