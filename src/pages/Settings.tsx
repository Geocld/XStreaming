import React from 'react';
import {
  StyleSheet,
  ScrollView,
  Alert,
  View,
  NativeModules,
  ToastAndroid,
} from 'react-native';
import {Text} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {getSettings, resetSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import {clearStreamToken} from '../store/streamTokenStore';
import {clearWebToken} from '../store/webTokenStore';
import {clearXcloudData} from '../store/xcloudStore';
import {clearConsolesData} from '../store/consolesStore';
import {clearServerData} from '../store/serverStore';

import bases from '../common/settings/bases';
import display from '../common/settings/display';
import gamepad from '../common/settings/gamepad';
import vgamepad from '../common/settings/vgamepad';
import audio from '../common/settings/audio';
import xcloud from '../common/settings/xcloud';
import xhome from '../common/settings/xhome';
import sensor from '../common/settings/sensor';
import server from '../common/settings/server';
import others from '../common/settings/others';

import pkg from '../../package.json';

const {UsbRumbleManager} = NativeModules;

const log = debugFactory('SettingsScreen');

function SettingsScreen({navigation}) {
  const {t, i18n} = useTranslation();
  const authentication = useSelector((state: any) => state.authentication);

  const currentLanguage = i18n.language;

  const [loading, setLoading] = React.useState(false);

  const sisuToken = authentication._tokenStore.getSisuToken();
  const userToken = authentication._tokenStore.getUserToken();

  let isAuthed = false;
  let user = '';

  if (sisuToken && sisuToken.data && sisuToken.data.AuthorizationToken) {
    isAuthed = true;

    if (sisuToken.data.AuthorizationToken.DisplayClaims) {
      try {
        user = sisuToken.data.AuthorizationToken.DisplayClaims.xui[0].mgt;
      } catch (e) {}
    }
  }

  if (userToken && userToken.data && userToken.data.access_token) {
    isAuthed = true;
  }

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
            clearStreamToken();
            clearWebToken();
            clearXcloudData();
            clearConsolesData();
            clearServerData();
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

  const handleClearCache = () => {
    clearXcloudData();
    clearConsolesData();
    clearServerData();
    resetSettings();
    ToastAndroid.show(t('Success'), ToastAndroid.SHORT);
    setTimeout(() => {
      RNRestart.restart();
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <Spinner loading={loading} text={t('Loading...')} />

      <ScrollView>
        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              ⚙️ {t('BasesSettings')}
            </Text>
          </View>

          {bases.map((meta, idx) => {
            return (
              <SettingItem
                key={meta.name || idx}
                title={meta.title}
                description={meta.description}
                onPress={() => handleItemPress(meta.name)}
              />
            );
          })}
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              🖥️ {t('DisplaySettings')}
            </Text>
          </View>

          {display.map((meta, idx) => {
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
            title={t('Display')}
            description={t(
              'Set parameters such as screen clarity and saturation',
            )}
            onPress={() => {
              const settings = getSettings();
              if (settings.render_engine === 'native') {
                Alert.alert(
                  t('Display settings is not working in native render engine.'),
                );
                return;
              }
              navigation.navigate('Display');
            }}
          />
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              🎮 {t('GamepadSettings')}
            </Text>
          </View>

          {gamepad.map((meta, idx) => {
            return (
              <SettingItem
                key={meta.name || idx}
                title={meta.title}
                description={meta.description}
                onPress={() => handleItemPress(meta.name)}
              />
            );
          })}
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              🧩 {t('vGamepadSettings')}
            </Text>
          </View>

          {vgamepad.map((meta, idx) => {
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
            title={t('Auto toggle hold buttons')}
            description={t('Select what buttons become toggle holdable')}
            onPress={() => {
              navigation.navigate('HoldButtons');
            }}
          />
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              🔊 {t('AudioSettings')}
            </Text>
          </View>

          {audio.map((meta, idx) => {
            return (
              <SettingItem
                key={meta.name || idx}
                title={meta.title}
                description={meta.description}
                onPress={() => handleItemPress(meta.name)}
              />
            );
          })}
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              ☁️ {t('XcloudSettings')}
            </Text>
          </View>

          {xcloud.map((meta, idx) => {
            return (
              <SettingItem
                key={meta.name || idx}
                title={meta.title}
                description={meta.description}
                onPress={() => handleItemPress(meta.name)}
              />
            );
          })}
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              {t('XchomeSettings')}
            </Text>
          </View>

          {xhome.map((meta, idx) => {
            return (
              <SettingItem
                key={meta.name || idx}
                title={meta.title}
                description={meta.description}
                onPress={() => handleItemPress(meta.name)}
              />
            );
          })}
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              {t('SensorSettings')}
            </Text>
          </View>

          {sensor.map((meta, idx) => {
            return (
              <SettingItem
                key={meta.name || idx}
                title={meta.title}
                description={meta.description}
                onPress={() => handleItemPress(meta.name)}
              />
            );
          })}
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              {t('DualSense')}
            </Text>
          </View>

          <SettingItem
            title={t('DualSense_adaptive_trigger_left')}
            description={`${t('DualSense_adaptive_trigger_left_desc')}`}
            onPress={() =>
              navigation.navigate({
                name: 'Ds5',
                params: {
                  type: 'left',
                },
              })
            }
          />

          <SettingItem
            title={t('DualSense_adaptive_trigger_right')}
            description={`${t('DualSense_adaptive_trigger_right_desc')}`}
            onPress={() =>
              navigation.navigate({
                name: 'Ds5',
                params: {
                  type: 'right',
                },
              })
            }
          />
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              🌐 {t('TurnServerSettings')}
            </Text>
          </View>

          {server.map((meta, idx) => {
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
            title={t('TURN server')}
            description={t('Custom TURN server')}
            onPress={() => navigation.navigate('Server')}
          />
        </View>

        <View>
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={styles.titleText}>
              {t('Others')}
            </Text>
          </View>

          {others.map((meta, idx) => {
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
            title={t('Clear Cache')}
            description={t('Clear XStreaming Cache Data(Keep login data)')}
            onPress={() => handleClearCache()}
          />

          <SettingItem
            title={t('Device testing')}
            description={t('Testing current device and controller')}
            onPress={() => navigation.navigate('DeviceInfos')}
          />

          <SettingItem
            title={t('About')}
            description={`${t('About XStreaming')}`}
            onPress={() => {
              if (currentLanguage === 'zh' || currentLanguage === 'zht') {
                navigation.navigate('AboutZh');
              } else {
                navigation.navigate('About');
              }
            }}
          />
          {(currentLanguage === 'zh' || currentLanguage === 'zht') && (
            <SettingItem
              title={'支持及交流'}
              description={'支持开发或交流使用心得'}
              onPress={() => navigation.navigate('Feedback')}
            />
          )}

          {__DEV__ && (
            <SettingItem
              title={'DEBUG'}
              description={'Enter debug'}
              onPress={() => handleItemPress('debug')}
            />
          )}

          <SettingItem
            title={t('HistoryTitle')}
            description={`${t('HistoryDesc')}`}
            onPress={() => navigation.navigate('History')}
          />

          <SettingItem
            title={t('Thanks')}
            onPress={() => navigation.navigate('Thanks')}
          />

          {isAuthed ? (
            <SettingItem
              title={t('Logout')}
              description={user ? `${t('Current user')}: ${user}` : ''}
              onPress={() => handleItemPress('logout')}
            />
          ) : null}
        </View>

        <View style={styles.version}>
          <Text style={styles.versionText} variant="titleMedium">
            {t('Version')}: v{pkg.version}
          </Text>
          <Text style={styles.versionText} variant="titleSmall">
            © 2024-{new Date().getFullYear()} Geocld
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  contentTitle: {
    padding: 15,
    paddingBottom: 0,
  },
  titleText: {
    color: '#107C10',
  },
  version: {
    paddingTop: 20,
    paddingBottom: 50,
    textAlign: 'center',
  },
  versionText: {
    textAlign: 'center',
    paddingTop: 10,
  },
});

export default SettingsScreen;
