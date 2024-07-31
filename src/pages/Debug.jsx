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
import {Portal, Modal, List, Text} from 'react-native-paper';
import {getSettings, saveSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';

const {GamepadManager, UsbRumbleManager} = NativeModules;

function DebugScreen({navigation, route}) {
  let authentication = useSelector(state => state.authentication);
  const [settings, setSettings] = React.useState({});

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    const eventEmitter = new NativeEventEmitter();

    // eventEmitter.addListener('onDeviceConnect', event => {
    //   Alert.alert('onDeviceConnect', JSON.stringify(event));
    // });

    navigation.addListener('beforeRemove', e => {
      console.log('beforeRemove:', e.data.action.type);
      // e.preventDefault();
    });
  }, [navigation]);

  return (
    <ScrollView>
      <Portal>
        <Modal
          visible={false}
          contentContainerStyle={{
            backgroundColor: 'white',
            padding: 20,
            marginLeft: '10%',
            marginRight: '10%',
          }}>
          <List.Section>
            <List.Item
              background={{
                borderless: false,
                color: 'red',
                foreground: true,
              }}
              title={'Disconnect'}
              onPress={() => {}}
            />
            <List.Item
              title={'Cancel'}
              // style={{width: '100%'}}
              background={{
                borderless: false,
                color: 'red',
                foreground: true,
              }}
              onPress={() => {}}
            />
          </List.Section>
        </Modal>
      </Portal>

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

          // setTimeout(() => {
          //   GamepadManager.vibrate(0, 0, 0, 0, 0);
          // }, 1000);
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
