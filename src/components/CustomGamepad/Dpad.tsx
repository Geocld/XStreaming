import React from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';

type Props = {
  style: any;
};

const GamepadButton: React.FC<Props> = ({style = {}}) => {
  return (
    <View style={[styles.dpad, style]}>
      <TouchableOpacity style={[styles.button, styles.dpadLeft]} />
      <TouchableOpacity style={[styles.button, styles.dpadTop]} />
      <TouchableOpacity style={[styles.button, styles.dpadRight]} />
      <TouchableOpacity style={[styles.button, styles.dpadBottom]} />
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
