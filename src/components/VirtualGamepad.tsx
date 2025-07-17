import React from 'react';
import {StyleSheet, View, Dimensions} from 'react-native';
import AnalogStick from '../components/AnalogStick';
import ButtonView from './ButtonView';
import {getSettings} from '../store/settingStore';

type Props = {
  opacity: number;
  onPressIn: (name: string) => {};
  onPressOut: (name: string) => {};
  onStickMove: (id: string, position: any) => {};
};

const VirtualGamepad: React.FC<Props> = ({
  opacity = 0.7,
  onPressIn,
  onPressOut,
  onStickMove,
}) => {
  const settings = getSettings();

  const handlePressIn = (name: string) => {
    onPressIn && onPressIn(name);
  };

  const handlePressOut = (name: string) => {
    onPressOut && onPressOut(name);
  };

  const handleStickMove = (id: string, data: any) => {
    onStickMove && onStickMove(id, data);
  };

  const {width, height} = Dimensions.get('window');

  const nexusLeft = width * 0.5 - 20;
  const viewLeft = width * 0.5 - 100;
  const menuLeft = width * 0.5 + 60;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <ButtonView
        style={[styles.button, styles.lt]}
        buttonName="control_button_lt"
        onPressIn={() => handlePressIn('LeftTrigger')}
        onPressOut={() => handlePressOut('LeftTrigger')}
      />

      <ButtonView
        style={[styles.button, styles.rt, {opacity}]}
        buttonName="control_button_rt"
        onPressIn={() => handlePressIn('RightTrigger')}
        onPressOut={() => handlePressOut('RightTrigger')}
      />

      <ButtonView
        style={[styles.button, styles.lb, {opacity}]}
        buttonName="control_button_lb"
        onPressIn={() => handlePressIn('LeftShoulder')}
        onPressOut={() => handlePressOut('LeftShoulder')}
      />

      <ButtonView
        style={[styles.button, styles.rb, {opacity}]}
        buttonName="control_button_rb"
        onPressIn={() => handlePressIn('RightShoulder')}
        onPressOut={() => handlePressOut('RightShoulder')}
      />

      <ButtonView
        style={[styles.button, styles.a, {opacity}]}
        buttonName="control_button_a"
        onPressIn={() => handlePressIn('A')}
        onPressOut={() => handlePressOut('A')}
      />

      <ButtonView
        style={[styles.button, styles.b, {opacity}]}
        buttonName="control_button_b"
        onPressIn={() => handlePressIn('B')}
        onPressOut={() => handlePressOut('B')}
      />

      <ButtonView
        style={[styles.button, styles.x, {opacity}]}
        buttonName="control_button_x"
        onPressIn={() => handlePressIn('X')}
        onPressOut={() => handlePressOut('X')}
      />

      <ButtonView
        style={[styles.button, styles.y, {opacity}]}
        buttonName="control_button_y"
        onPressIn={() => handlePressIn('Y')}
        onPressOut={() => handlePressOut('Y')}
      />

      <ButtonView
        style={[
          styles.button,
          styles.l3,
          settings.virtual_gamepad_joystick === 1
            ? {bottom: 30, left: 225}
            : {},
          {opacity},
        ]}
        buttonName="control_button_left_joystick_down"
        onPressIn={() => handlePressIn('LeftThumb')}
        onPressOut={() => handlePressOut('LeftThumb')}
      />

      <ButtonView
        style={[
          styles.button,
          styles.r3,
          settings.virtual_gamepad_joystick === 1
            ? {bottom: 30, right: 225}
            : {},
          {opacity},
        ]}
        buttonName="control_button_right_joystick_down"
        onPressIn={() => handlePressIn('RightThumb')}
        onPressOut={() => handlePressOut('RightThumb')}
      />

      <ButtonView
        style={[styles.button, styles.view, {left: viewLeft, opacity}]}
        buttonName="control_button_view"
        onPressIn={() => handlePressIn('View')}
        onPressOut={() => handlePressOut('View')}
      />

      <ButtonView
        style={[styles.button, styles.nexus, {left: nexusLeft, opacity}]}
        buttonName="control_button_xbox"
        onPressIn={() => handlePressIn('Nexus')}
        onPressOut={() => handlePressOut('Nexus')}
      />

      <ButtonView
        style={[styles.button, styles.menu, {left: menuLeft, opacity}]}
        buttonName="control_button_menu"
        onPressIn={() => handlePressIn('Menu')}
        onPressOut={() => handlePressOut('Menu')}
      />

      <ButtonView
        style={[styles.button, styles.dpadTop, {opacity}]}
        buttonName="control_button_up"
        onPressIn={() => handlePressIn('DPadUp')}
        onPressOut={() => handlePressOut('DPadUp')}
      />

      <ButtonView
        style={[styles.button, styles.dpadLeft, {opacity}]}
        buttonName="control_button_left"
        onPressIn={() => handlePressIn('DPadLeft')}
        onPressOut={() => handlePressOut('DPadLeft')}
      />

      <ButtonView
        style={[styles.button, styles.dpadBottom, {opacity}]}
        buttonName="control_button_down"
        onPressIn={() => handlePressIn('DPadDown')}
        onPressOut={() => handlePressOut('DPadDown')}
      />

      <ButtonView
        style={[styles.button, styles.dpadRight, {opacity}]}
        buttonName="control_button_right"
        onPressIn={() => handlePressIn('DPadRight')}
        onPressOut={() => handlePressOut('DPadRight')}
      />

      {settings.virtual_gamepad_joystick === 1 ? (
        <View
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            zIndex: 9,
            width: width * 0.5,
            height: height,
          }}>
          <AnalogStick
            style={{
              width: width * 0.5,
              height: height,
            }}
            radius={140}
            handleRadius={80}
            onStickChange={(data: any) => handleStickMove('left', data)}
          />
        </View>
      ) : null}

      {settings.virtual_gamepad_joystick === 1 ? (
        <View
          // eslint-disable-next-line react-native/no-inline-styles
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 9,
            width: width * 0.5,
            height: height,
          }}>
          <AnalogStick
            style={{
              width: width * 0.5,
              height: height,
            }}
            radius={150}
            handleRadius={100}
            onStickChange={(data: any) => handleStickMove('right', data)}
          />
        </View>
      ) : null}

      {settings.virtual_gamepad_joystick === 0 ? (
        <View style={[styles.button, styles.leftJs, {opacity}]}>
          <AnalogStick
            style={styles.analogStick}
            radius={140}
            handleRadius={80}
            onStickChange={(data: any) => handleStickMove('left', data)}
          />
        </View>
      ) : null}

      {settings.virtual_gamepad_joystick === 0 ? (
        <View style={[styles.button, styles.rightJs, {opacity}]}>
          <AnalogStick
            style={styles.analogStick}
            radius={150}
            handleRadius={100}
            onStickChange={(data: any) => handleStickMove('right', data)}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    // backgroundColor: 'rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: 9,
  },
  button: {
    width: 50,
    height: 50,
    opacity: 0.6,
    position: 'absolute',
    zIndex: 10,
  },
  lt: {
    left: 30,
    top: 40,
  },
  rt: {
    right: 30,
    top: 30,
  },
  lb: {
    left: 30,
    top: 110,
  },
  rb: {
    right: 30,
    top: 100,
  },
  a: {
    bottom: 60,
    right: 70,
  },
  b: {
    bottom: 110,
    right: 20,
  },
  x: {
    bottom: 110,
    right: 120,
  },
  y: {
    bottom: 160,
    right: 70,
  },
  l3: {
    bottom: 80,
    left: 225,
  },
  r3: {
    bottom: 40,
    right: 235,
  },
  view: {
    bottom: 10,
  },
  nexus: {
    bottom: 10,
  },
  menu: {
    bottom: 10,
  },
  leftJs: {
    left: 180,
    bottom: 150,
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  rightJs: {
    right: 200,
    bottom: 100,
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  dpadLeft: {
    width: 60,
    height: 60,
    left: 20,
    bottom: 80,
  },
  dpadTop: {
    width: 60,
    height: 60,
    left: 75,
    bottom: 135,
  },
  dpadRight: {
    width: 60,
    height: 60,
    left: 130,
    bottom: 80,
  },
  dpadBottom: {
    width: 60,
    height: 60,
    left: 75,
    bottom: 25,
  },
  analogStick: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, .5)',
    overflow: 'hidden',
  },
});

export default VirtualGamepad;
