import React from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';

type Props = {
  style: any;
  scale?: number;
  onPressIn: any;
  onPressOut: any;
};

const GamepadButton: React.FC<Props> = ({
  style = {},
  scale = 1,
  onPressIn,
  onPressOut,
}) => {
  const handlePressIn = (name: string) => {
    onPressIn && onPressIn(name);
  };

  const handlePressOut = (name: string) => {
    onPressOut && onPressOut(name);
  };

  return (
    <View style={[styles.dpad, {transform: [{scale}]}, style]}>
      <TouchableOpacity
        style={[styles.button, styles.dpadLeft]}
        onPressIn={() => {
          handlePressIn('DPadLeft');
        }}
        onPressOut={() => {
          handlePressOut('DPadLeft');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadTop]}
        onPressIn={() => {
          handlePressIn('DPadUp');
        }}
        onPressOut={() => {
          handlePressOut('DPadUp');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadRight]}
        onPressIn={() => {
          handlePressIn('DPadRight');
        }}
        onPressOut={() => {
          handlePressOut('DPadRight');
        }}
      />
      <TouchableOpacity
        style={[styles.button, styles.dpadBottom]}
        onPressIn={() => {
          handlePressIn('DPadDown');
        }}
        onPressOut={() => {
          handlePressOut('DPadDown');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dpad: {
    position: 'absolute',
    width: 50,
    height: 50,
  },
  button: {
    position: 'absolute',
  },
  dpadLeft: {
    width: 30,
    height: 20,
    borderWidth: 2,
    borderColor: '#fff',
    left: 30,
    bottom: 80,
    borderRightWidth: 0,
  },
  dpadTop: {
    width: 20,
    height: 30,
    borderWidth: 2,
    borderColor: '#fff',
    left: 58,
    bottom: 100,
    borderBottomWidth: 0,
  },
  dpadRight: {
    width: 30,
    height: 20,
    borderWidth: 2,
    borderColor: '#fff',
    left: 76,
    bottom: 80,
    borderLeftWidth: 0,
  },
  dpadBottom: {
    width: 20,
    height: 30,
    borderWidth: 2,
    borderColor: '#fff',
    left: 58,
    bottom: 50,
    borderTopWidth: 0,
  },
});

export default GamepadButton;
