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
  List,
  Button,
  RadioButton,
  Text,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GamepadButton from '../components/CustomGamepad/Button';
// import Dpad from '../components/CustomGamepad/Dpad';
import {getSettings, saveSettings, deleteSetting} from '../store/gamepadStore';

const {FullScreenManager} = NativeModules;

function CustomGamepadScreen({navigation, route}) {
  const {t} = useTranslation();
  const [settings, setSettings] = React.useState({});
  const [title, setTitle] = React.useState('');
  const [defaultButtons, setDefaultButtons] = React.useState([]);
  const [buttons, setButtons] = React.useState([]);
  const [showActionModal, setActionShowModal] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [reloader, setReloader] = React.useState(Date.now());
  const [value, setValue] = React.useState('first');

  React.useEffect(() => {
    const _settings = getSettings();
    let _title = '';
    setSettings(_settings);

    if (route.params?.name) {
      _title = route.params?.name;
      setTitle(route.params?.name);
    }

    console.log('route.params?.name:', _title);
    console.log('_settings:', _settings);

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
      if (_settings[_title]) {
        const exitButtons = _settings[_title];
        setButtons(exitButtons);
      } else {
        setButtons(_buttons);
      }
      setDefaultButtons(_buttons);
    }, 500);

    navigation.addListener('beforeRemove', e => {
      if (e.data.action.type !== 'GO_BACK') {
        navigation.dispatch(e.data.action);
      } else {
        e.preventDefault();
        setActionShowModal(true);
      }
    });

    return () => {
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();
    };
  }, [navigation, route.params?.name]);

  const handleDrag = (name, x, y) => {
    buttons.forEach(b => {
      if (b.name === name) {
        b.x = Math.round(x);
        b.y = Math.round(y);
      }
    });
    setButtons([...buttons]);
  };

  const background = {
    borderless: false,
    color: 'rgba(255, 255, 255, 0.2)',
    foreground: true,
  };

  const handleSave = () => {
    // console.log('buttons:', buttons);
    saveSettings(title, buttons);
    navigation.navigate('Settings');
  };

  const handleDelete = () => {
    deleteSetting(title);
    navigation.navigate('Settings');
  };

  // console.log('button:', buttons);
  return (
    <SafeAreaView style={styles.container}>
      <Portal>
        <Modal
          visible={showActionModal}
          onDismiss={() => setActionShowModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <List.Section>
                <List.Item
                  title={t('Save')}
                  background={background}
                  onPress={() => handleSave()}
                />
                {settings[title] && (
                  <List.Item
                    title={t('Delete')}
                    background={background}
                    onPress={() => handleDelete()}
                  />
                )}
                <List.Item
                  title={t('Exit')}
                  background={background}
                  onPress={() => navigation.navigate('VirtualGamepadSettings')}
                />
              </List.Section>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={showModal}
          onDismiss={() => {
            setShowModal(false);
          }}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <Slider
                value={1}
                minimumValue={1}
                maximumValue={5}
                step={0.1}
                onValueChange={val => {
                  console.log('slider value:', value);
                }}
                lowerLimit={1}
                minimumTrackTintColor="#107C10"
                maximumTrackTintColor="grey"
              />
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
                key={button.name + reloader}
                renderSize={100}
                renderColor="white"
                isCircle
                onShortPressRelease={() => {
                  setShowModal(true);
                }}
                onDragRelease={event => {
                  handleDrag(
                    button.name,
                    event.nativeEvent.pageX - event.nativeEvent.locationX,
                    event.nativeEvent.pageY - event.nativeEvent.locationY,
                  );
                  setReloader(Date.now());
                }}
              />
            );
          } else {
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name + reloader}
                onShortPressRelease={() => {
                  setShowModal(true);
                }}
                onDragRelease={event => {
                  handleDrag(
                    button.name,
                    event.nativeEvent.pageX - event.nativeEvent.locationX,
                    event.nativeEvent.pageY - event.nativeEvent.locationY,
                  );
                  setReloader(Date.now());
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
