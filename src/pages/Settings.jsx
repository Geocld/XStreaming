import React from 'react';
import {StyleSheet, ScrollView, Alert} from 'react-native';
import {Layout} from '@ui-kitten/components';
import Spinner from 'react-native-loading-spinner-overlay';
import {getSettings, saveSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import LocaleModal from '../components/LocaleModal';
import ResolutionModal from '../components/ResolutionModal';
import BitrateModal from '../components/BitrateModal';
import GamepadKernalModal from '../components/GamepadKernalModal';
import VibrationModal from '../components/VibrationModal';
import VibrationModeModal from '../components/VibrationModeModal';
import DeadZoneModal from '../components/DeadZoneModal';
import RegionModal from '../components/RegionModal';
import GameLangModal from '../components/GameLangModal';
import Ipv6Modal from '../components/Ipv6Modal';
import CodecModal from '../components/CodecModal';
import SingnalModal from '../components/SingnalModal';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';

const log = debugFactory('SettingsScreen');

function SettingsScreen({navigation}) {
  const {t, i18n} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const profile = useSelector(state => state.profile);

  const [loading, setLoading] = React.useState(false);
  const [showLocaleModal, setShowLocaleModal] = React.useState(false);
  const [showResolutionModal, setShowResolutionModal] = React.useState(false);
  const [showBitrateModal, setShowBitrateModal] = React.useState(false);
  const [showCodecModal, setShowCodecModal] = React.useState(false);
  const [showVibrationModal, setShowVibrationModal] = React.useState(false);
  const [showVibrationModeModal, setShowVibrationModeModal] =
    React.useState(false);
  const [showDeadZoneModal, setShowDeadZoneModal] = React.useState(false);
  const [showGamepadKernalModal, setShowGamepadKernalModal] =
    React.useState(false);
  const [showRegionModal, setShowRegionModal] = React.useState(false);
  const [showGameLangModal, setShowGameLangModal] = React.useState(false);
  const [showSignalingModal, setShowSignalingModal] = React.useState(false);
  const [showIpv6Modal, setShowIpv6Modal] = React.useState(false);
  const [settings, setSettings] = React.useState({});
  const [currentModal, setCurrentModal] = React.useState('');

  React.useEffect(() => {
    log.info('settings page show');

    const _settings = getSettings();
    log.info('Get localSettings:', _settings);
    setSettings(_settings);
  }, [navigation]);

  const handleItemPress = id => {
    setCurrentModal(id);
    if (id === 'locale') {
      setShowLocaleModal(true);
    }
    if (id === 'resolution') {
      setShowResolutionModal(true);
    }
    if (id === 'xhome_bitrate') {
      setShowBitrateModal(true);
    }
    if (id === 'xcloud_bitrate') {
      setShowBitrateModal(true);
    }
    if (id === 'codec') {
      setShowCodecModal(true);
    }
    if (id === 'vibration') {
      setShowVibrationModal(true);
    }
    if (id === 'vibration_mode') {
      setShowVibrationModeModal(true);
    }
    if (id === 'dead_zone') {
      setShowDeadZoneModal(true);
    }
    if (id === 'region') {
      setShowRegionModal(true);
    }
    if (id === 'game_lang') {
      setShowGameLangModal(true);
    }
    if (id === 'ipv6') {
      setShowIpv6Modal(true);
    }
    if (id === 'signaling_home') {
      setShowSignalingModal(true);
    }
    if (id === 'signaling_cloud') {
      setShowSignalingModal(true);
    }
    if (id === 'gamepad_kernal') {
      setShowGamepadKernalModal(true);
    }
    if (id === 'debug') {
      navigation.navigate('Debug');
    }
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
            }, 2000);
          },
        },
      ]);
    }
  };

  // Set locale
  const handleChangeLocale = value => {
    settings.locale = value;
    setSettings(settings);
    saveSettings(settings);
    setShowLocaleModal(false);
    i18n.changeLanguage(value);
  };

  // Set resolution
  const handleChangeResolution = value => {
    settings.resolution = value;
    setSettings(settings);
    saveSettings(settings);
    setShowResolutionModal(false);
  };

  // Set bitrate
  const handleChangeBitrate = (mode, value) => {
    if (currentModal === 'xhome_bitrate') {
      settings.xhome_bitrate_mode = mode;
      settings.xhome_bitrate = value;
    } else if (currentModal === 'xcloud_bitrate') {
      settings.xcloud_bitrate_mode = mode;
      settings.xcloud_bitrate = value;
    }

    setSettings(settings);
    saveSettings(settings);
    setShowBitrateModal(false);
  };

  // Set codec
  const handleChangeCodec = value => {
    settings.codec = value;
    setSettings(settings);
    saveSettings(settings);
    setShowCodecModal(false);
  };

  // Set vibration On/Off
  const handleChangeVibration = value => {
    settings.vibration = value;
    setSettings(settings);
    saveSettings(settings);
    setShowVibrationModal(false);
  };

  // Set vibration mode
  const handleChangeVibrationMode = value => {
    settings.vibration_mode = value;
    setSettings(settings);
    saveSettings(settings);
    setShowVibrationModeModal(false);
  };

  // Set gamepad kernal
  const handleGamepadKernal = value => {
    settings.gamepad_kernal = value;
    setSettings(settings);
    saveSettings(settings);
    setShowGamepadKernalModal(false);
  };
  // Set Ipv6
  const handleSetIpv6 = value => {
    settings.ipv6 = value;
    setSettings(settings);
    saveSettings(settings);
    setShowIpv6Modal(false);
  };

  // Set dead zone
  const handleChangeDeadZone = value => {
    settings.dead_zone = value;
    setSettings(settings);
    saveSettings(settings);
    setShowDeadZoneModal(false);
  };

  // Set region
  const handleChangeRegion = value => {
    setLoading(true);
    settings.force_region_ip = value;
    setSettings(settings);
    saveSettings(settings);
    setShowRegionModal(false);

    // Reload app to refresh token
    setTimeout(() => {
      setLoading(false);
      RNRestart.restart();
    }, 1000);
  };

  // Set game language of xcloud
  const handleChangeGameLang = value => {
    settings.preferred_game_language = value;
    setSettings(settings);
    saveSettings(settings);
    setShowGameLangModal(false);
  };

  return (
    <Layout style={styles.container}>
      <Spinner
        visible={loading}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      <LocaleModal
        show={showLocaleModal}
        current={settings.locale}
        onSelect={handleChangeLocale}
        onClose={() => setShowLocaleModal(false)}
      />

      <ResolutionModal
        show={showResolutionModal}
        current={settings.resolution}
        onSelect={handleChangeResolution}
        onClose={() => setShowResolutionModal(false)}
      />

      {showBitrateModal && (
        <BitrateModal
          show={showBitrateModal}
          isCloud={currentModal === 'xcloud_bitrate'}
          currentMode={
            currentModal === 'xcloud_bitrate'
              ? settings.xcloud_bitrate_mode
              : settings.xhome_bitrate_mode
          }
          currentValue={
            currentModal === 'xcloud_bitrate'
              ? settings.xcloud_bitrate
              : settings.xhome_bitrate
          }
          onConfirm={handleChangeBitrate}
          onClose={() => setShowBitrateModal(false)}
        />
      )}

      <CodecModal
        show={showCodecModal}
        current={settings.codec}
        onSelect={handleChangeCodec}
        onClose={() => setShowCodecModal(false)}
      />

      <GamepadKernalModal
        show={showGamepadKernalModal}
        current={settings.gamepad_kernal}
        onSelect={handleGamepadKernal}
        onClose={() => setShowGamepadKernalModal(false)}
      />
      <VibrationModal
        show={showVibrationModal}
        current={settings.vibration}
        onSelect={handleChangeVibration}
        onClose={() => setShowVibrationModal(false)}
      />

      <Ipv6Modal
        show={showIpv6Modal}
        current={settings.ipv6}
        onSelect={handleSetIpv6}
        onClose={() => handleSetIpv6(false)}
      />

      <VibrationModeModal
        show={showVibrationModeModal}
        current={settings.vibration_mode}
        onSelect={handleChangeVibrationMode}
        onClose={() => setShowVibrationModeModal(false)}
      />

      {showDeadZoneModal && (
        <DeadZoneModal
          show={showDeadZoneModal}
          current={settings.dead_zone}
          onConfirm={handleChangeDeadZone}
          onClose={() => setShowDeadZoneModal(false)}
        />
      )}

      <RegionModal
        show={showRegionModal}
        current={settings.force_region_ip}
        onSelect={handleChangeRegion}
        onClose={() => setShowRegionModal(false)}
      />

      <SingnalModal
        show={showSignalingModal}
        currentMode={currentModal}
        onSelect={() => setShowSignalingModal(false)}
        onClose={() => setShowSignalingModal(false)}
      />

      <GameLangModal
        show={showGameLangModal}
        current={settings.preferred_game_language}
        onSelect={handleChangeGameLang}
        onClose={() => setShowGameLangModal(false)}
      />

      <ScrollView>
        <SettingItem
          title={t('App language')}
          description={t('Set language of XStreaming')}
          onPress={() => handleItemPress('locale')}
        />
        <SettingItem
          title={t('Resolution')}
          description={`${t('Set resolution, support 720P/1080P.')} ${t(
            'Current',
          )}: ${settings.resolution ? settings.resolution : ''}`}
          onPress={() => handleItemPress('resolution')}
        />
        <SettingItem
          title={t('Host stream bitrate')}
          description={t(
            'Set the host streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)',
          )}
          onPress={() => handleItemPress('xhome_bitrate')}
        />
        <SettingItem
          title={t('Cloud stream bitrate')}
          description={t(
            'Set the cloud streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)',
          )}
          onPress={() => handleItemPress('xcloud_bitrate')}
        />
        <SettingItem
          title={t('Codec')}
          description={`${t(
            'If your device supports newer codecs, it can reduce the video bandwidth requirements.',
          )} ${t('Current')}: ${!settings.codec ? 'Auto' : settings.codec}`}
          onPress={() => handleItemPress('codec')}
        />
        <SettingItem
          title={t('Gamepad kernal')}
          description={t('Select gamepad kernal')}
          onPress={() => handleItemPress('gamepad_kernal')}
        />
        <SettingItem
          title={t('Vibration')}
          description={`${t(
            'If your controller supports vibration, you can set whether it vibrates during the game.',
          )} ${t('Current')}: ${settings.vibration ? t('On') : t('Off')}`}
          onPress={() => handleItemPress('vibration')}
        />
        <SettingItem
          title={t('Vibration mode')}
          description={`${t('Native: Use native gamepad kernal to vibrate')}
${t("Device: Use Phone/Pad's vibrate")}
${t('Webview: Use Chromium kernal to vibrate')}`}
          onPress={() => handleItemPress('vibration_mode')}
        />
        <SettingItem
          title={t('Joystick dead zone')}
          description={t('Config joystick dead zone')}
          onPress={() => handleItemPress('dead_zone')}
        />
        <SettingItem
          title={t('Set region')}
          description={t(
            'Changing the region allows you to use XGPU services without a proxy',
          )}
          onPress={() => handleItemPress('region')}
        />
        <SettingItem
          title={t('Ipv6')}
          description={t('Prioritize using IPv6 connection')}
          onPress={() => handleItemPress('ipv6')}
        />
        <SettingItem
          title={t('Signal server(xHome)')}
          description={t(
            'The signaling server is a server for stream negotiation. If the host cannot connect, please try modifying this option',
          )}
          onPress={() => handleItemPress('signaling_home')}
        />
        <SettingItem
          title={t('Signal server(xCloud)')}
          description={t(
            'The signaling server is a server for stream negotiation. If the host cannot connect, please try modifying this option',
          )}
          onPress={() => handleItemPress('signaling_cloud')}
        />
        <SettingItem
          title={t('Preferred language of game')}
          description={t('Set language of cloud game')}
          onPress={() => handleItemPress('game_lang')}
        />
        <SettingItem
          title={t('Key mapping')}
          description={t('Mapping key of gamepad')}
          onPress={() => {
            navigation.navigate('GameMap');
          }}
        />
        <SettingItem
          title={'About'}
          description={'About XStreaming.'}
          onPress={() => navigation.navigate('About')}
        />
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
    </Layout>
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
});

export default SettingsScreen;
