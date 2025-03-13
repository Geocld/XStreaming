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

    // const eventEmitter = new NativeEventEmitter();

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
        description={'Test gamepad rumble'}
        onPress={() => {
          // handleRumble(int duration, short lowFreqMotor, short highFreqMotor, short leftTrigger, short rightTrigger, int intensity)
          GamepadManager.rumble(60000, 20000, 40000, 30000, 30000);

          setTimeout(() => {
            GamepadManager.rumble(60000, 0, 0, 0, 0);
          }, 500);
        }}
      />
    </ScrollView>
  );
}

export default DebugScreen;
