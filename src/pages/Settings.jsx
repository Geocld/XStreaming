import React from 'react';
import {StyleSheet, ScrollView, Alert, View, NativeModules} from 'react-native';
import {Text} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import {getSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import settingsMeta from '../common/settings';

const {UsbRumbleManager} = NativeModules;

const log = debugFactory('SettingsScreen');

function SettingsScreen({navigation}) {
  const {t, i18n} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const profile = useSelector(state => state.profile);

  const currentLanguage = i18n.language;
  console.log('currentLanguage:', currentLanguage);

  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    log.info('settings page show');
  }, [navigation]);

  const handleItemPress = async id => {
    if (id === 'logout') {
      Alert.alert(t('Warning'), t('Do you want to logout?'), [
        {
          text: t('Cancel'),
          style: 'cancel',
        },
        {
          text: t('Confirm'),
          style: 'default',
          onPress: () => {
            setLoading(true);
            authentication._tokenStore.clear();
            CookieManager.clearAll();
            setTimeout(() => {
              RNRestart.restart();
            }, 1000);
          },
        },
      ]);
    } else if (id === 'maping') {
      const settings = getSettings();
      const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
      const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;
      if (isUsbMode) {
        Alert.alert(
          t(
            'After replacing the Android controller driver, controller button mapping is temporarily not supported',
          ),
        );
        return;
      }
      if (settings.gamepad_kernal === 'Web') {
        navigation.navigate('GameMap');
      } else {
        navigation.navigate('NativeGameMap');
      }
    } else if (id === 'debug') {
      navigation.navigate('Debug');
    } else {
      navigation.navigate('SettingDetail', {
        id,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Spinner
        visible={loading}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      <ScrollView>
        {settingsMeta.map((meta, idx) => {
          return (
            <SettingItem
              key={meta.name || idx}
              title={meta.title}
              description={meta.description}
              onPress={() => handleItemPress(meta.name)}
            />
          );
        })}

        <SettingItem
          title={t('Customize virtual buttons')}
          description={t('Customize buttons of virtual gamepad')}
          onPress={() => {
            navigation.navigate('VirtualGamepadSettings');
          }}
        />

        <SettingItem
          title={t('Display')}
          description={t(
            'Set parameters such as screen clarity and saturation',
          )}
          onPress={() => navigation.navigate('Display')}
        />

        <View style={styles.contentTitle}>
          <Text variant="titleLarge" style={styles.titleText}>
            {t('Others')}
          </Text>
        </View>
        <SettingItem
          title={t('About')}
          description={t('About XStreaming')}
          onPress={() => navigation.navigate('About')}
        />
        {(currentLanguage === 'zh' || currentLanguage === 'zht') && (
          <SettingItem
            title={'反馈及支持'}
            description={'如果你遇到使用问题或希望支持XStreaming，请从此进'}
            onPress={() => navigation.navigate('Feedback')}
          />
        )}

        <SettingItem
          title={'DEBUG'}
          description={'Enter debug.'}
          onPress={() => handleItemPress('debug')}
        />

        {profile && profile.GameDisplayName ? (
          <SettingItem
            title={t('Logout')}
            description={`${t('Current user')}: ${
              profile ? profile.GameDisplayName : ''
            }`}
            onPress={() => handleItemPress('logout')}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  spinnerTextStyle: {
    color: '#FFF',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  contentTitle: {
    padding: 15,
    paddingBottom: 0,
  },
});

export default SettingsScreen;
