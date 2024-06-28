import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {Button, Text, Icon} from '@ui-kitten/components';
import {useSelector, useDispatch} from 'react-redux';
import {getSettings, saveSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import DebugModal from '../components/DebugModal';

function DebugScreen({navigation, route}) {
  let authentication = useSelector(state => state.authentication);
  const [settings, setSettings] = React.useState({});
  const [showDebugModal, setShowDebugModal] = React.useState(false);

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);
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
    </ScrollView>
  );
}

export default DebugScreen;
