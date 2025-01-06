import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  ScrollView,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import {useSelector, useDispatch} from 'react-redux';
import {Portal, Dialog, Switch} from 'react-native-paper';
import {getSettings, saveSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';

const {GamepadManager, UsbRumbleManager} = NativeModules;

function DebugScreen({navigation, route}) {
  let authentication = useSelector(state => state.authentication);
  const [showDebug, setShowDebug] = React.useState(false);
  const [debug, setDebug] = React.useState(false);
  const [settings, setSettings] = React.useState({});

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    console.log('_settings:', _settings);

    setDebug(_settings.debug);

    const eventEmitter = new NativeEventEmitter();

    // eventEmitter.addListener('onDeviceConnect', event => {
    //   Alert.alert('onDeviceConnect', JSON.stringify(event));
    // });

    navigation.addListener('beforeRemove', e => {
      console.log('beforeRemove:', e.data.action.type);
      // e.preventDefault();
    });
  }, [navigation]);

  const handleToggleDebug = value => {
    setDebug(value);
    setShowDebug(false);
    settings.debug = value;
    setSettings(settings);
    saveSettings(settings);
  };

  return (
    <ScrollView>
      <Portal>
        <Dialog visible={showDebug} onDismiss={() => setShowDebug(false)}>
          <Dialog.Title>Open debug</Dialog.Title>
          <Dialog.Content>
            <Switch value={debug} onValueChange={handleToggleDebug} />
          </Dialog.Content>
        </Dialog>
      </Portal>

      <SettingItem
        title={'Webview debug'}
        description={'Open webview debug'}
        onPress={() => {
          setShowDebug(true);
        }}
      />
      {/* <SettingItem
        title={'Show tokens'}
        description={'Show auth token'}
        onPress={() => {
          const userToken = authentication._tokenStore.getUserToken();
          const sisuToken = authentication._tokenStore.getSisuToken();
          const result = `
      userToken: ${JSON.stringify(userToken)}

      -----------------

      sisuToken: ${JSON.stringify(sisuToken)}
      `;
          Alert.alert('Token', result);
        }}
      /> */}
      {/* <SettingItem
        title={'Gamepad debug'}
        description={`Test OTG Gamepad.`}
        onPress={() => navigation.navigate('GamepadDebug')}
      /> */}
      <SettingItem
        title={'Vibration(Native)'}
        description={'Test gamepad vibration'}
        onPress={() => {
          // handleRumble(int duration, short lowFreqMotor, short highFreqMotor, short leftTrigger, short rightTrigger, int intensity)
          GamepadManager.vibrate(60000, 100, 100, 100, 1000, 5);

          setTimeout(() => {
            GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
          }, 500);

          // setTimeout(() => {
          //   GamepadManager.vibrate(0, 0, 0, 0, 0);
          // }, 1000);
        }}
      />

      <SettingItem
        title={'Vibration(usb)'}
        description={'Test gamepad rumble in override mode'}
        onPress={() => {
          UsbRumbleManager.rumble(32767, 32767);

          setTimeout(() => {
            UsbRumbleManager.rumble(0, 0);
          }, 500);
        }}
      />

      <SettingItem
        title={'Trigger Rumble(xbox one controller)'}
        description={'Test gamepad trigger rumble with override mode'}
        onPress={() => {
          UsbRumbleManager.rumbleTriggers(32767, 32767);

          setTimeout(() => {
            UsbRumbleManager.rumbleTriggers(0, 0);
          }, 1000);
        }}
      />
    </ScrollView>
  );
}

export default DebugScreen;
