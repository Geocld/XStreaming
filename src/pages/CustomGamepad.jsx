import React from 'react';
import Orientation from 'react-native-orientation-locker';
import {
  SafeAreaView,
  StyleSheet,
  NativeModules,
  Dimensions,
  View,
} from 'react-native';
import {
  Portal,
  Modal,
  Card,
  Button,
  RadioButton,
  Text,
} from 'react-native-paper';
import Draggable from 'react-native-draggable';
import GamepadButton from '../components/CustomGamepad/Button';
// import Dpad from '../components/CustomGamepad/Dpad';
import {getSettings, saveSettings} from '../store/settingStore';

const {FullScreenManager} = NativeModules;

function CustomGamepadScreen({navigation, route}) {
  // const [settings, setSettings] = React.useState({});
  const [buttons, setButtons] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [value, setValue] = React.useState('first');

  React.useEffect(() => {
    // const _settings = getSettings();
    // setSettings(_settings);

    // console.log('_settings:', _settings);
    console.log('CustomGamepadScreen');
    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();
    setTimeout(() => {
      const {width, height} = Dimensions.get('window');

      const nexusLeft = width * 0.5 - 20;
      const viewLeft = width * 0.5 - 100;
      const menuLeft = width * 0.5 + 60;

      const _buttons = [
        {
          name: 'LeftTrigger',
          x: 20,
          y: 40,
          show: true,
        },
        {
          name: 'RightTrigger',
          x: width - 20,
          y: 40,
          show: true,
        },
        {
          name: 'LeftShoulder',
          x: 20,
          y: 100,
          show: true,
        },
        {
          name: 'RightShoulder',
          x: width - 20,
          y: 100,
          show: true,
        },
        {
          name: 'A',
          x: width - 70,
          y: height - 50,
          show: true,
        },
        {
          name: 'B',
          x: width - 30,
          y: height - 90,
          show: true,
        },
        {
          name: 'X',
          x: width - 110,
          y: height - 90,
          show: true,
        },
        {
          name: 'Y',
          x: width - 70,
          y: height - 130,
          show: true,
        },
        {
          name: 'LeftThumb',
          x: 130,
          y: height - 50,
          show: true,
        },
        {
          name: 'RightThumb',
          x: width - 210,
          y: height - 30,
          show: true,
        },
        {
          name: 'View',
          x: viewLeft,
          y: height - 30,
          show: true,
        },
        {
          name: 'Nexus',
          x: nexusLeft,
          y: height - 30,
          show: true,
        },
        {
          name: 'Menu',
          x: menuLeft,
          y: height - 30,
          show: true,
        },
        {
          name: 'Dpad',
          x: 20,
          y: height - 170,
          width: 100,
          height: 100,
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
      setButtons(_buttons);
    }, 500);

    return () => {
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();
    };
  }, []);

  const handleDrag = (name, dx, dy) => {
    console.log('name:', name);
    console.log('dx:', dx);
    console.log('dy:', dy);
  };

  // console.log('button:', buttons);
  return (
    <SafeAreaView style={styles.container}>
      <Portal>
        <Modal
          visible={showModal}
          onDismiss={() => {
            setShowModal(false);
          }}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <RadioButton.Group onValueChange={v => setValue(v)} value={value}>
                <RadioButton.Item label="1" value="1x" />
                <RadioButton.Item label="2" value="2x" />
                <RadioButton.Item label="3" value="3x" />
                <RadioButton.Item label="4" value="4x" />
              </RadioButton.Group>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <>
        {buttons.map(button => {
          if (button.name === 'LeftStick' || button.name === 'RightStick') {
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name}
                renderSize={100}
                renderColor="white"
                isCircle
                onShortPressRelease={() => {
                  setShowModal(true);
                }}
                onDragRelease={(_, gestureState) => {
                  handleDrag(button.name, gestureState.dx, gestureState.dy);
                }}
              />
            );
          } else {
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name}
                onShortPressRelease={() => {
                  setShowModal(true);
                }}
                onDragRelease={(_, gestureState) => {
                  handleDrag(button.name, gestureState.dx, gestureState.dy);
                }}>
                <GamepadButton
                  name={button.name}
                  width={button.width}
                  height={button.height}
                />
              </Draggable>
            );
          }
        })}
      </>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modal: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginLeft: '35%',
    marginRight: '35%',
  },
});

export default CustomGamepadScreen;
