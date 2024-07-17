import React from 'react';
import {StyleSheet, View, Text, Pressable} from 'react-native';
import {SvgXml} from 'react-native-svg';
import icons from '../common/virtualgp';
import {ReactNativeJoystick} from '../components/Joystick';

type Props = {
  onPress: () => {};
};

const VirtualGamepad: React.FC<Props> = ({onPress}) => {
  const handlePress = () => {
    onPress && onPress();
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.button, styles.lt]}>
        <SvgXml xml={icons.LeftTrigger} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.rt]}>
        <SvgXml xml={icons.RightTrigger} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.lb]}>
        <SvgXml xml={icons.LeftShoulder} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.rb]}>
        <SvgXml xml={icons.RightShoulder} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.a]}>
        <SvgXml xml={icons.A} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.b]}>
        <SvgXml xml={icons.B} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.x]}>
        <SvgXml xml={icons.X} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.y]}>
        <SvgXml xml={icons.Y} width="50" height="50" />
      </View>
      <View style={[styles.button, styles.leftJs]}>
        <ReactNativeJoystick
          color="#ffffff"
          radius={50}
          onMove={data => console.log(data)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  button: {
    opacity: 0.5,
    position: 'absolute',
  },
  lt: {
    left: 20,
    top: 20,
  },
  rt: {
    right: 20,
    top: 20,
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
    right: 100,
  },
  b: {
    bottom: 100,
    right: 50,
  },
  x: {
    bottom: 100,
    right: 150,
  },
  y: {
    bottom: 150,
    right: 100,
  },
  leftJs: {
    left: 100,
    bottom: 100,
  },
});

export default VirtualGamepad;
