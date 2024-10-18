import React from 'react';
import {StyleSheet, View, TouchableOpacity, Dimensions} from 'react-native';
import GamepadButton from './GamepadButton';
import Dpad from './CustomGamepad/Dpad';
import {ReactNativeJoystick} from '../components/Joystick';
import {getSettings} from '../store/gamepadStore';

type Props = {
  title: string;
  opacity: number;
  onPressIn: (name: string) => {};
  onPressOut: (name: string) => {};
  onStickMove: (id: string, position: any) => {};
};

const CustomVirtualGamepad: React.FC<Props> = ({
  title = 'test',
  opacity = 0.6,
  onPressIn,
  onPressOut,
  onStickMove,
}) => {
  const [buttons, setButtons] = React.useState<any>([]);

  React.useEffect(() => {
    const _settings = getSettings();
    const {width, height} = Dimensions.get('window');

    const nexusLeft = width * 0.5 - 20;
    const viewLeft = width * 0.5 - 100;
    const menuLeft = width * 0.5 + 60;

    const _buttons = [
      {
        name: 'LeftTrigger',
        x: 20,
        y: 40,
        scale: 1,
        show: true,
      },
      {
        name: 'RightTrigger',
        x: width - 20,
        y: 40,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftShoulder',
        x: 20,
        y: 100,
        scale: 1,
        show: true,
      },
      {
        name: 'RightShoulder',
        x: width - 20,
        y: 100,
        scale: 1,
        show: true,
      },
      {
        name: 'A',
        x: width - 70,
        y: height - 50,
        scale: 1,
        show: true,
      },
      {
        name: 'B',
        x: width - 30,
        y: height - 90,
        scale: 1,
        show: true,
      },
      {
        name: 'X',
        x: width - 110,
        y: height - 90,
        scale: 1,
        show: true,
      },
      {
        name: 'Y',
        x: width - 70,
        y: height - 130,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftThumb',
        x: 130,
        y: height - 50,
        scale: 1,
        show: true,
      },
      {
        name: 'RightThumb',
        x: width - 210,
        y: height - 30,
        scale: 1,
        show: true,
      },
      {
        name: 'View',
        x: viewLeft,
        y: height - 30,
        scale: 1,
        show: true,
      },
      {
        name: 'Nexus',
        x: nexusLeft,
        y: height - 30,
        scale: 1,
        show: true,
      },
      {
        name: 'Menu',
        x: menuLeft,
        y: height - 30,
        scale: 1,
        show: true,
      },
      {
        name: 'Dpad',
        x: 20,
        y: height - 170,
        width: 100,
        height: 100,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftStick',
        x: 175,
        y: height - 185,
        show: true,
      },
      {
        name: 'RightStick',
        x: width - 255,
        y: height - 155,
        show: true,
      },
    ];
    if (_settings[title]) {
      const exitButtons = _settings[title];
      setButtons(exitButtons);
    } else {
      setButtons(_buttons);
    }
  }, [title]);

  const handlePressIn = (name: string) => {
    onPressIn && onPressIn(name);
  };

  const handlePressOut = (name: string) => {
    onPressOut && onPressOut(name);
  };

  const handleStickMove = (id: string, data: any) => {
    onStickMove && onStickMove(id, data);
  };

  console.log('buttons:', buttons);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {buttons.map((button: any) => {
        if (button.name === 'Dpad') {
          return (
            <Dpad
              key={button.name}
              style={{
                opacity: opacity,
                left: button.x,
                top: button.y + 100,
              }}
            />
          );
        } else if (button.name === 'LeftStick') {
          return (
            <View
              style={[
                styles.button,
                {top: button.y, left: button.x},
                {opacity},
              ]}>
              <ReactNativeJoystick
                color="#ffffff"
                radius={50}
                onMove={data => handleStickMove('left', data)}
                onStart={data => handleStickMove('left', data)}
                onStop={data => handleStickMove('left', data)}
              />
            </View>
          );
        } else if (button.name === 'RightStick') {
          return (
            <View
              style={[
                styles.button,
                {top: button.y, left: button.x},
                {opacity},
              ]}>
              <ReactNativeJoystick
                color="#ffffff"
                style={{opacity}}
                radius={50}
                onMove={data => handleStickMove('right', data)}
                onStart={data => handleStickMove('right', data)}
                onStop={data => handleStickMove('right', data)}
              />
            </View>
          );
        } else {
          return (
            <GamepadButton
              key={button.name}
              name={button.name}
              style={[
                styles.button,
                {opacity},
                {top: button.y, left: button.x},
              ]}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            />
          );
        }
      })}
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
});

export default CustomVirtualGamepad;
