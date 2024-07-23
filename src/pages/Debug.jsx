import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import {Button, Text, Icon} from '@ui-kitten/components';
import {useSelector, useDispatch} from 'react-redux';
import {getSettings, saveSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import DebugModal from '../components/DebugModal';

const {GamepadManager, UsbRumbleManager} = NativeModules;

function DebugScreen({navigation, route}) {
  let authentication = useSelector(state => state.authentication);
  const [settings, setSettings] = React.useState({});
  const [showDebugModal, setShowDebugModal] = React.useState(false);

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    const eventEmitter = new NativeEventEmitter();

    eventEmitter.addListener('onDeviceConnect', event => {
      Alert.alert('Token', JSON.stringify(event));
    });

    navigation.addListener('beforeRemove', e => {
      console.log('beforeRemove:', e.data.action.type);
      // e.preventDefault();
    });
  }, [navigation]);

  const handleChangeDebug = value => {
    settings.debug = value;
    setSettings(settings);
    saveSettings(settings);
    setShowDebugModal(false);
  };

  return (
    <ScrollView>
      <DebugModal
        show={showDebugModal}
        current={settings.debug}
        onSelect={handleChangeDebug}
        onClose={() => handleChangeDebug(false)}
      />

      <SettingItem
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
      />
      <SettingItem
        title={'Open debug mode'}
        description={`Open stream screen debug mode`}
        onPress={() => setShowDebugModal(true)}
      />
      {/* <SettingItem
        title={'Gamepad debug'}
        description={`Test OTG Gamepad.`}
        onPress={() => navigation.navigate('GamepadDebug')}
      /> */}
      <SettingItem
        title={'Vibration(Native)'}
        description={'Test gamepad vibration'}
        onPress={() => {
          // handleRumble(int duration, short lowFreqMotor, short highFreqMotor, short leftTrigger, short rightTrigger)
          GamepadManager.vibrate(500, 10, 20, 10, 10);
        }}
      />

      <SettingItem
        title={'Vibration(xInput)'}
        description={'Test gamepad vibration with x-input mode'}
        onPress={() => {
          UsbRumbleManager.rumble();
        }}
      />
    </ScrollView>
  );
}

export default DebugScreen;
