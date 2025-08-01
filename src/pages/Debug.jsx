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

import AnalogStick from '../components/AnalogStick';
import ButtonView from '../components/ButtonView';

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

  const handleAnalogStickChange = event => {
    // console.log('Analog stick position:', event.x, event.y);
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
        onPress={async () => {
          const hasValidUsbDevice =
            await UsbRumbleManager.getHasValidUsbDevice();
          const usbController = await UsbRumbleManager.getUsbController();
          if (hasValidUsbDevice) {
            if (usbController === 'DualSenseController') {
              UsbRumbleManager.setDsController(
                16,
                124,
                16,
                0,
                0,
                0,
                100,
                100,
                0,
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                6,
                [20, 255, 10, 0, 0, 0, 0, 0, 0, 0],
              );

              setTimeout(() => {
                UsbRumbleManager.setDsController(
                  16,
                  124,
                  16,
                  0,
                  0,
                  0,
                  0,
                  0,
                  0,
                  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                  6,
                  [20, 255, 10, 0, 0, 0, 0, 0, 0, 0],
                );
              }, 50);
            } else {
              UsbRumbleManager.rumble(32767, 32767);

              setTimeout(() => {
                UsbRumbleManager.rumble(0, 0);
              }, 500);
            }
          }
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

      <View style={styles.analogStick}>
        <AnalogStick
          style={styles.analogStick}
          radius={150}
          handleRadius={50}
          onStickChange={handleAnalogStickChange}
        />
      </View>

      <View>
        <ButtonView
          style={{width: 100, height: 100}}
          buttonName="control_button_rt"
          onPressIn={() => {
            console.log('rt onPressIn');
          }}
          onPressOut={() => {
            console.log('rt onPressOut');
          }}
        />

        <ButtonView
          style={{width: 100, height: 100}}
          buttonName="control_button_lb"
          onPressIn={() => {
            console.log('lb onPressIn');
          }}
          onPressOut={() => {
            console.log('lb onPressOut');
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  analogStick: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#666',
    overflow: 'hidden',
  },
});

export default DebugScreen;
