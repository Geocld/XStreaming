import React from 'react';
import {StyleSheet, View, Dimensions} from 'react-native';
import GamepadButton from './CustomGamepad/GamepadButton';
import Dpad from './CustomGamepad/Dpad';
import AnalogStick from '../components/AnalogStick';
import {getSettings} from '../store/gamepadStore';

type Props = {
  title: string;
  opacity: number;
  onPressIn: (name: string) => {};
  onPressOut: (name: string) => {};
  onStickMove: (id: string, position: any) => {};
};

const CustomVirtualGamepad: React.FC<Props> = ({
  title,
  opacity = 0.7,
  onPressIn,
  onPressOut,
  onStickMove,
}) => {
  const [buttons, setButtons] = React.useState<any>([]);

  React.useEffect(() => {
    const _settings = getSettings();
    const {width, height} = Dimensions.get('window');

    const nexusLeft = width * 0.5 - 30;
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
        x: width - 85,
        y: height - 70,
        scale: 1,
        show: true,
      },
      {
        name: 'B',
        x: width - 45,
        y: height - 110,
        scale: 1,
        show: true,
      },
      {
        name: 'X',
        x: width - 125,
        y: height - 110,
        scale: 1,
        show: true,
      },
      {
        name: 'Y',
        x: width - 85,
        y: height - 150,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftThumb',
        x: 200,
        y: height - 90,
        scale: 1,
        show: true,
      },
      {
        name: 'RightThumb',
        x: width - 230,
        y: height - 80,
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
        y: height - 50,
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
        x: 50,
        y: height - 140,
        width: 100,
        height: 100,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftStick',
        x: 175,
        y: height - 205,
        show: true,
      },
      {
        name: 'RightStick',
        x: width - 265,
        y: height - 195,
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

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {buttons.map((button: any) => {
        if (!button.show) {
          return null;
        }
        if (button.name === 'Dpad') {
          return (
            <Dpad
              key={button.name}
              scale={button.scale}
              style={{
                opacity: opacity,
                left: button.x - 15,
                top: button.y + 100,
              }}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            />
          );
        } else if (button.name === 'LeftStick') {
          return (
            <View
              key={button.name}
              style={[
                styles.button,
                {top: button.y, left: button.x},
                {opacity},
              ]}>
              <View style={styles.leftJs}>
                <AnalogStick
                  style={styles.analogStick}
                  radius={140}
                  handleRadius={80}
                  onStickChange={(data: any) => handleStickMove('left', data)}
                />
              </View>
            </View>
          );
        } else if (button.name === 'RightStick') {
          return (
            <View
              key={button.name}
              style={[
                styles.button,
                {top: button.y, left: button.x},
                {opacity},
              ]}>
              <View style={styles.rightJs}>
                <AnalogStick
                  style={styles.analogStick}
                  radius={140}
                  handleRadius={80}
                  onStickChange={(data: any) => handleStickMove('right', data)}
                />
              </View>
            </View>
          );
        } else {
          return (
            <GamepadButton
              key={button.name}
              name={button.name}
              scale={button.scale}
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
  leftJs: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  rightJs: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
  },
  analogStick: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, .3)',
    overflow: 'hidden',
  },
});

export default CustomVirtualGamepad;
