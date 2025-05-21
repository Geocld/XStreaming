import React from 'react';
import {StyleSheet, View, TouchableOpacity, Dimensions} from 'react-native';
import GamepadButton from './GamepadButton';
import {ReactNativeJoystick} from '../components/Joystick';

type Props = {
  opacity: number;
  onPressIn: (name: string) => {};
  onPressOut: (name: string) => {};
  onStickMove: (id: string, position: any) => {};
};

const VirtualGamepad: React.FC<Props> = ({
  opacity = 0.8,
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

  const nexusLeft = width * 0.5 - 30;
  const viewLeft = width * 0.5 - 100;
  const menuLeft = width * 0.5 + 60;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <GamepadButton
        name="LeftTrigger"
        style={[styles.button, styles.lt, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="RightTrigger"
        style={[styles.button, styles.rt, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="LeftShoulder"
        style={[styles.button, styles.lb, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="RightShoulder"
        style={[styles.button, styles.rb, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="A"
        style={[styles.button, styles.a, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="B"
        style={[styles.button, styles.b, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="X"
        style={[styles.button, styles.x, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="Y"
        style={[styles.button, styles.y, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="LeftThumb"
        style={[styles.button, styles.l3, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="RightThumb"
        style={[styles.button, styles.r3, {opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="View"
        style={[styles.button, styles.view, {left: viewLeft, opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="Nexus"
        style={[styles.button, styles.nexus, {left: nexusLeft, opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      />

      <GamepadButton
        name="Menu"
        style={[styles.button, styles.menu, {left: menuLeft, opacity}]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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
        <ReactNativeJoystick
          color="#ffffff"
          radius={50}
          onMove={data => handleStickMove('left', data)}
          onStart={data => handleStickMove('left', data)}
          onStop={data => handleStickMove('left', data)}
        />
      </View>

      <View style={[styles.button, styles.rightJs, {opacity}]}>
        <ReactNativeJoystick
          color="#ffffff"
          style={{opacity}}
          radius={50}
          onMove={data => handleStickMove('right', data)}
          onStart={data => handleStickMove('right', data)}
          onStop={data => handleStickMove('right', data)}
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
    opacity: 0.5,
    position: 'absolute',
  },
  lt: {
    left: 20,
    top: 40,
  },
  rt: {
    right: 20,
    top: 40,
  },
  lb: {
    left: 20,
    top: 100,
  },
  rb: {
    right: 20,
    top: 100,
  },
  a: {
    bottom: 50,
    right: 50,
  },
  b: {
    bottom: 90,
    right: 10,
  },
  x: {
    bottom: 90,
    right: 90,
  },
  y: {
    bottom: 130,
    right: 50,
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
    left: 160,
    bottom: 140,
  },
  rightJs: {
    right: 200,
    bottom: 100,
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
});

export default VirtualGamepad;
