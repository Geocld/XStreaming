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
  RadioButton,
  Text,
  Divider,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import Draggable from 'react-native-draggable';
import Slider from '@react-native-community/slider';
import GamepadButton from '../components/CustomGamepad/Button';
import {getSettings, saveSettings, deleteSetting} from '../store/gamepadStore';
import {
  getSettings as getUserSettings,
  saveSettings as saveUserSettings,
} from '../store/settingStore';

const {FullScreenManager} = NativeModules;

function CustomGamepadScreen({navigation, route}) {
  const {t} = useTranslation();
  const [settings, setSettings] = React.useState({});
  const [title, setTitle] = React.useState('');
  const [defaultButtons, setDefaultButtons] = React.useState([]);
  const [buttons, setButtons] = React.useState([]);
  const [showActionModal, setActionShowModal] = React.useState(false);
  const [showWarnModal, setShowWarnShowModal] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [reloader, setReloader] = React.useState(Date.now());

  const [currentButton, setCurrentButton] = React.useState('');
  const [currentScale, setCurrentScale] = React.useState(1);
  const [currentShow, setCurrentShow] = React.useState(true);

  React.useEffect(() => {
    const _settings = getSettings();
    let _title = '';
    setSettings(_settings);

    if (route.params?.name) {
      _title = route.params?.name;
      setTitle(route.params?.name);
    }

    // console.log('_settings:', _settings);
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
          x: 30,
          y: 40,
          scale: 1,
          show: true,
        },
        {
          name: 'RightTrigger',
          x: width - 40,
          y: 40,
          scale: 1,
          show: true,
        },
        {
          name: 'LeftShoulder',
          x: 30,
          y: 100,
          scale: 1,
          show: true,
        },
        {
          name: 'RightShoulder',
          x: width - 40,
          y: 110,
          scale: 1,
          show: true,
        },
        {
          name: 'A',
          x: width - 90,
          y: height - 60,
          scale: 1,
          show: true,
        },
        {
          name: 'B',
          x: width - 40,
          y: height - 110,
          scale: 1,
          show: true,
        },
        {
          name: 'X',
          x: width - 140,
          y: height - 110,
          scale: 1,
          show: true,
        },
        {
          name: 'Y',
          x: width - 90,
          y: height - 160,
          scale: 1,
          show: true,
        },
        {
          name: 'LeftThumb',
          x: 210,
          y: height - 80,
          scale: 1,
          show: true,
        },
        {
          name: 'RightThumb',
          x: width - 235,
          y: height - 70,
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
          name: 'DPadUp',
          x: 85,
          y: height - 145,
          show: true,
        },
        {
          name: 'DPadLeft',
          x: 35,
          y: height - 95,
          show: true,
        },
        {
          name: 'DPadDown',
          x: 85,
          y: height - 45,
          show: true,
        },
        {
          name: 'DPadRight',
          x: 135,
          y: height - 95,
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
      if (_settings[_title]) {
        const exitButtons = _settings[_title];
        setButtons(exitButtons);
      } else {
        setButtons(_buttons);
      }
      setDefaultButtons(_buttons);

      setShowWarnShowModal(true);
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

  // Button drag
  const handleDrag = (name, x, y) => {
    buttons.forEach(b => {
      if (b.name === name) {
        b.x = Math.round(x);
        b.y = Math.round(y);
      }
    });
    setButtons([...buttons]);
  };

  // Button size change
  const handleChangeSize = scale => {
    buttons.forEach(b => {
      if (b.name === currentButton) {
        b.scale = scale;
      }
    });
    setButtons([...buttons]);
  };

  // Button show change
  const handleChangeShow = value => {
    console.log('handleChangeShow:', value);
    setCurrentShow(value);
    buttons.forEach(b => {
      if (b.name === currentButton) {
        b.show = value;
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

  const handleReset = () => {
    const {width, height} = Dimensions.get('window');

    const nexusLeft = width * 0.5 - 20;
    const viewLeft = width * 0.5 - 100;
    const menuLeft = width * 0.5 + 60;

    const _buttons = [
      {
        name: 'LeftTrigger',
        x: 30,
        y: 40,
        scale: 1,
        show: true,
      },
      {
        name: 'RightTrigger',
        x: width - 40,
        y: 40,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftShoulder',
        x: 30,
        y: 100,
        scale: 1,
        show: true,
      },
      {
        name: 'RightShoulder',
        x: width - 40,
        y: 110,
        scale: 1,
        show: true,
      },
      {
        name: 'A',
        x: width - 90,
        y: height - 60,
        scale: 1,
        show: true,
      },
      {
        name: 'B',
        x: width - 40,
        y: height - 110,
        scale: 1,
        show: true,
      },
      {
        name: 'X',
        x: width - 140,
        y: height - 110,
        scale: 1,
        show: true,
      },
      {
        name: 'Y',
        x: width - 90,
        y: height - 160,
        scale: 1,
        show: true,
      },
      {
        name: 'LeftThumb',
        x: 210,
        y: height - 80,
        scale: 1,
        show: true,
      },
      {
        name: 'RightThumb',
        x: width - 235,
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
        name: 'DPadUp',
        x: 85,
        y: height - 145,
        show: true,
      },
      {
        name: 'DPadLeft',
        x: 35,
        y: height - 95,
        show: true,
      },
      {
        name: 'DPadDown',
        x: 85,
        y: height - 45,
        show: true,
      },
      {
        name: 'DPadRight',
        x: 135,
        y: height - 95,
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
    setButtons([..._buttons]);
  };

  const handleDelete = () => {
    const userSettings = getUserSettings();
    if (userSettings.custom_virtual_gamepad === title) {
      userSettings.custom_virtual_gamepad = '';
      saveUserSettings(userSettings);
    }
    deleteSetting(title);
    navigation.navigate('Settings');
  };

  const renderWarningModal = () => {
    return (
      <Portal>
        <Modal
          visible={showWarnModal}
          onDismiss={() => setShowWarnShowModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <Text>
                TIPS1:{' '}
                {t(
                  'The position of custom virtual buttons may have discrepancies with actual rendering. Please refer to the actual effect for accuracy',
                )}
              </Text>
              <Text>
                TIPS2: {t('Click on an element to set its size and display')}
              </Text>
              <Text>TIPS3: {t('Drag elements to adjust their position')}</Text>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderWarningModal()}

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
                <List.Item
                  title={t('Reset')}
                  background={background}
                  onPress={() => handleReset()}
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
              {currentButton !== 'LeftStick' &&
                currentButton !== 'RightStick' && (
                  <>
                    <View style={styles.title}>
                      <Text>{t('Size')}</Text>
                      <Divider style={styles.divider} />
                    </View>
                    <Slider
                      value={currentScale}
                      minimumValue={1}
                      maximumValue={4}
                      step={0.1}
                      onValueChange={val => {
                        setCurrentScale(val);
                        handleChangeSize(val);
                      }}
                      lowerLimit={1}
                      minimumTrackTintColor="#107C10"
                      maximumTrackTintColor="grey"
                    />
                  </>
                )}

              <View style={styles.title}>
                <Text>{t('ShowTitle')}</Text>
                <Divider style={styles.divider} />
              </View>
              <RadioButton.Group
                onValueChange={val => handleChangeShow(val)}
                value={currentShow}>
                <RadioButton.Item label={t('Show')} value={true} />
                <RadioButton.Item label={t('Hide')} value={false} />
              </RadioButton.Group>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <>
        {buttons.map(button => {
          if (button.name === 'LeftStick' || button.name === 'RightStick') {
            if (!button.show) {
              return null;
            }
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name + reloader}
                renderSize={100}
                renderColor="white"
                isCircle
                onShortPressRelease={() => {
                  setCurrentButton(button.name);
                  setCurrentScale(1);
                  setCurrentShow(button.show || true);
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
            if (!button.show) {
              return null;
            }
            return (
              <Draggable
                x={button.x}
                y={button.y}
                key={button.name + reloader}
                onShortPressRelease={() => {
                  setCurrentButton(button.name);
                  setCurrentScale(button.scale || 1);
                  setCurrentShow(button.show || true);
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
                  scale={button.scale}
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
  title: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  divider: {
    marginTop: 10,
  },
});

export default CustomGamepadScreen;
