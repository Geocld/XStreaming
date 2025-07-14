import React from 'react';
import {StyleSheet, View, TouchableOpacity, Dimensions} from 'react-native';
import AnalogStick from '../components/AnalogStick';
import ButtonView from './ButtonView';

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
  const handlePressIn = (name: string) => {
    onPressIn && onPressIn(name);
  };

  const handlePressOut = (name: string) => {
    onPressOut && onPressOut(name);
  };

  const handleStickMove = (id: string, data: any) => {
    onStickMove && onStickMove(id, data);
  };

  const {width} = Dimensions.get('window');

  const nexusLeft = width * 0.5 - 20;
  const viewLeft = width * 0.5 - 100;
  const menuLeft = width * 0.5 + 60;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <ButtonView
        style={[styles.button, styles.lt]}
        buttonName="control_button_lt"
        onPressIn={() => {
          console.log('lt onPressIn');
        }}
        onPressOut={() => {
          console.log('lt onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.rt, {opacity}]}
        buttonName="control_button_rt"
        onPressIn={() => {
          console.log('rt onPressIn');
        }}
        onPressOut={() => {
          console.log('rt onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.lb, {opacity}]}
        buttonName="control_button_lb"
        onPressIn={() => {
          console.log('lb onPressIn');
        }}
        onPressOut={() => {
          console.log('lb onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.rb, {opacity}]}
        buttonName="control_button_rb"
        onPressIn={() => {
          console.log('rb onPressIn');
        }}
        onPressOut={() => {
          console.log('rb onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.a, {opacity}]}
        buttonName="control_button_a"
        onPressIn={() => {
          console.log('a onPressIn');
        }}
        onPressOut={() => {
          console.log('a onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.b, {opacity}]}
        buttonName="control_button_b"
        onPressIn={() => {
          console.log('b onPressIn');
        }}
        onPressOut={() => {
          console.log('b onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.x, {opacity}]}
        buttonName="control_button_x"
        onPressIn={() => {
          console.log('x onPressIn');
        }}
        onPressOut={() => {
          console.log('x onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.y, {opacity}]}
        buttonName="control_button_y"
        onPressIn={() => {
          console.log('y onPressIn');
        }}
        onPressOut={() => {
          console.log('y onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.l3, {opacity}]}
        buttonName="control_button_left_joystick_down"
        onPressIn={() => {
          console.log('l3 onPressIn');
        }}
        onPressOut={() => {
          console.log('l3 onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.r3, {opacity}]}
        buttonName="control_button_right_joystick_down"
        onPressIn={() => {
          console.log('r3 onPressIn');
        }}
        onPressOut={() => {
          console.log('r3 onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.view, {left: viewLeft, opacity}]}
        buttonName="control_button_view"
        onPressIn={() => {
          console.log('view onPressIn');
        }}
        onPressOut={() => {
          console.log('view onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.nexus, {left: nexusLeft, opacity}]}
        buttonName="control_button_xbox"
        onPressIn={() => {
          console.log('nexus onPressIn');
        }}
        onPressOut={() => {
          console.log('nexus onPressOut');
        }}
      />

      <ButtonView
        style={[styles.button, styles.menu, {left: menuLeft, opacity}]}
        buttonName="control_button_menu"
        onPressIn={() => {
          console.log('menu onPressIn');
        }}
        onPressOut={() => {
          console.log('menu onPressOut');
        }}
      />

      <TouchableOpacity
        style={[styles.button, styles.dpadLeft, {opacity}]}
        onPressIn={() => {
          handlePressIn('DPadLeft');
        }}
        onPressOut={() => {
          handlePressOut('DPadLeft');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadTop, {opacity}]}
        onPressIn={() => {
          handlePressIn('DPadUp');
        }}
        onPressOut={() => {
          handlePressOut('DPadUp');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadRight, {opacity}]}
        onPressIn={() => {
          handlePressIn('DPadRight');
        }}
        onPressOut={() => {
          handlePressOut('DPadRight');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadBottom, {opacity}]}
        onPressIn={() => {
          handlePressIn('DPadDown');
        }}
        onPressOut={() => {
          handlePressOut('DPadDown');
        }}
      />

      <View style={[styles.button, styles.leftJs, {opacity}]}>
        <AnalogStick
          style={styles.analogStick}
          radius={140}
          handleRadius={80}
          onStickChange={(data: any) => handleStickMove('left', data)}
        />
      </View>

      <View style={[styles.button, styles.rightJs, {opacity}]}>
        <AnalogStick
          style={styles.analogStick}
          radius={150}
          handleRadius={100}
          onStickChange={(data: any) => handleStickMove('right', data)}
        />
      </View>
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
    top: 110,
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
    left: 195,
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
    left: 140,
    bottom: 140,
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
    width: 50,
    height: 30,
    borderWidth: 2,
    borderColor: '#fff',
    left: 30,
    bottom: 80,
    borderRightWidth: 0,
  },
  dpadTop: {
    width: 30,
    height: 50,
    borderWidth: 2,
    borderColor: '#fff',
    left: 78,
    bottom: 110,
    borderBottomWidth: 0,
  },
  dpadRight: {
    width: 50,
    height: 30,
    borderWidth: 2,
    borderColor: '#fff',
    left: 106,
    bottom: 80,
    borderLeftWidth: 0,
  },
  dpadBottom: {
    width: 30,
    height: 50,
    borderWidth: 2,
    borderColor: '#fff',
    left: 78,
    bottom: 30,
    borderTopWidth: 0,
  },
  analogStick: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, .3)',
    overflow: 'hidden',
  },
});

export default VirtualGamepad;
