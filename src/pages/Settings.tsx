import React from 'react';
import {
  StyleSheet,
  ScrollView,
  Alert,
  View,
  NativeModules,
  ToastAndroid,
  Platform,
} from 'react-native';
import {Text, useTheme} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {getSettings, resetSettings} from '../store/settingStore';
import SettingItem from '../components/SettingItem';
import {useSelector} from 'react-redux';
import RNRestart from 'react-native-restart';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import {useGamepadNavigation, useGamepadActiveState} from '../utils/useGamepadNavigation';
import GamepadFooterHints from '../components/GamepadFooterHints';
import {debugFactory} from '../utils/debug';
import {clearStreamToken} from '../store/streamTokenStore';
import {clearWebToken} from '../store/webTokenStore';
import {clearXcloudData} from '../store/xcloudStore';
import {clearConsolesData} from '../store/consolesStore';
import {clearServerData} from '../store/serverStore';
import {storage} from '../store/mmkv';

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
  const theme = useTheme();
  const authentication = useSelector((state: any) => state.authentication);

  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState();
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const currentLanguage = i18n.language;
  const titleTextStyle = React.useMemo(
    () => [styles.titleText, {color: theme.colors.primary}],
    [theme.colors.primary],
  );

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

  const handleItemPress = async (id: any) => {
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
            try {
              storage.delete('user.account_tier');
              storage.delete('user.account_tier_owner');
              storage.delete('user.gamertag');
              storage.delete('user.gamerpic');
            } catch {}
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

  const settingActions = React.useMemo(() => {
    const list: (() => void)[] = [];
    // bases
    bases.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    // xcloud
    xcloud.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    // display
    display.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    list.push(() => {
      const settings = getSettings();
      if (
        settings.render_engine === 'native' ||
        settings.render_engine === 'nano'
      ) {
        Alert.alert(
          t('Display settings is not working in native render engine.'),
        );
        return;
      }
      navigation.navigate('Display');
    });
    // gamepad
    gamepad.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    list.push(() => {
      navigation.navigate('GamepadTest');
    });
    // vgamepad
    vgamepad.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    list.push(() => {
      navigation.navigate('VirtualGamepadSettings');
    });
    list.push(() => {
      navigation.navigate('HoldButtons');
    });
    list.push(() => {
      navigation.navigate('VirtualMacroSettings');
    });
    // audio
    audio.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    // xhome
    xhome.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    // sensor
    sensor.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    // dualsense
    list.push(() =>
      navigation.navigate({
        name: 'Ds5',
        params: {
          type: 'left',
        },
      }),
    );
    list.push(() =>
      navigation.navigate({
        name: 'Ds5',
        params: {
          type: 'right',
        },
      }),
    );
    // server
    server.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    list.push(() => navigation.navigate('Server'));
    // others
    others.forEach(meta => {
      list.push(() => handleItemPress(meta.name));
    });
    list.push(() => handleClearCache());
    list.push(() => navigation.navigate('Transfer'));
    list.push(() => navigation.navigate('DeviceInfos'));
    list.push(() => {
      if (currentLanguage === 'zh' || currentLanguage === 'zht') {
        navigation.navigate('AboutZh');
      } else {
        navigation.navigate('About');
      }
    });
    if (currentLanguage === 'zh' || currentLanguage === 'zht') {
      list.push(() => navigation.navigate('Feedback'));
    }
    if (__DEV__) {
      list.push(() => handleItemPress('debug'));
    }
    list.push(() => navigation.navigate('History'));
    list.push(() => navigation.navigate('Thanks'));
    if (isAuthed) {
      list.push(() => handleItemPress('logout'));
    }
    return list;
  }, [navigation, currentLanguage, isAuthed, t]);

  useGamepadNavigation({
    onUp: () => {
      setFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      setFocusedIndex(prev => Math.min(settingActions.length - 1, prev + 1));
    },
    onSelect: () => {
      if (settingActions[focusedIndex]) {
        settingActions[focusedIndex]();
      }
    },
    onBack: () => {
      navigation.goBack();
    },
  });

  const itemLayouts = React.useRef<Record<number, {y: number; height: number}>>({});
  const scrollViewHeight = React.useRef<number>(0);

  const scrollToFocused = React.useCallback((index: number) => {
    const layout = itemLayouts.current[index];
    if (layout && scrollViewRef.current) {
      const viewH = scrollViewHeight.current || 600;
      const targetY = Math.max(0, layout.y - (viewH - layout.height) / 2);
      scrollViewRef.current.scrollTo({y: targetY, animated: true});
    }
  }, []);

  React.useEffect(() => {
    if (isGamepadActive || Platform.isTV) {
      scrollToFocused(focusedIndex);
    }
  }, [focusedIndex, isGamepadActive, scrollToFocused]);

  React.useEffect(() => {
    log.info('settings page show');
  }, [navigation]);

  let itemIndexCounter = 0;
  const renderItem = (
    title: string,
    description: string | undefined,
    onPress: () => void,
    key?: any,
  ) => {
    const index = itemIndexCounter++;
    const isFocused =
      (isGamepadActive || Platform.isTV) && focusedIndex === index;
    return (
      <View
        key={key ?? index}
        onLayout={e => {
          const l = e.nativeEvent.layout;
          itemLayouts.current[index] = {y: l.y, height: l.height};
          if (focusedIndex === index && (isGamepadActive || Platform.isTV)) {
            scrollToFocused(index);
          }
        }}>
        <SettingItem
          title={title}
          description={description}
          isFocused={isFocused}
          onPress={onPress}
        />
      </View>
    );
  };

  return (
    <View
      style={styles.container}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <Spinner loading={loading} text={t('Loading...')} />

      <ScrollView
        ref={scrollViewRef}
        removeClippedSubviews={false}
        onLayout={e => {
          scrollViewHeight.current = e.nativeEvent.layout.height;
        }}
        contentContainerStyle={{
          paddingBottom: isGamepadActive || Platform.isTV ? 160 : 20,
        }}>
        <React.Fragment key="bases">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              ⚙️ {t('BasesSettings')}
            </Text>
          </View>

          {bases.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}
        </React.Fragment>

        <React.Fragment key="xcloud">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              ☁️ {t('XcloudSettings')}
            </Text>
          </View>

          {xcloud.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}
        </React.Fragment>

        <React.Fragment key="display">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              🖥️ {t('DisplaySettings')}
            </Text>
          </View>

          {display.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}

          {renderItem(
            t('Display'),
            t('Set parameters such as screen clarity and saturation'),
            () => {
              const settings = getSettings();
              if (
                settings.render_engine === 'native' ||
                settings.render_engine === 'nano'
              ) {
                Alert.alert(
                  t('Display settings is not working in native render engine.'),
                );
                return;
              }
              navigation.navigate('Display');
            },
            'display_custom',
          )}
        </React.Fragment>

        <React.Fragment key="gamepad">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              🎮 {t('GamepadSettings')}
            </Text>
          </View>

          {gamepad.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}

          {renderItem(
            t('GamepadTestTitle'),
            t('GamepadTestDescription'),
            () => {
              navigation.navigate('GamepadTest');
            },
            'gamepad_test',
          )}
        </React.Fragment>

        <React.Fragment key="vgamepad">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              🧩 {t('vGamepadSettings')}
            </Text>
          </View>

          {vgamepad.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}

          {renderItem(
            t('Customize virtual buttons'),
            t('Customize buttons of virtual gamepad'),
            () => {
              navigation.navigate('VirtualGamepadSettings');
            },
            'vgamepad_custom',
          )}

          {renderItem(
            t('Auto toggle hold buttons'),
            t('Select what buttons become toggle holdable'),
            () => {
              navigation.navigate('HoldButtons');
            },
            'vgamepad_hold',
          )}

          {renderItem(
            t('Virtual macro settings'),
            t('Enable macro button and edit its action sequence'),
            () => {
              navigation.navigate('VirtualMacroSettings');
            },
            'vgamepad_macro',
          )}
        </React.Fragment>

        <React.Fragment key="audio">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              🔊 {t('AudioSettings')}
            </Text>
          </View>

          {audio.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}
        </React.Fragment>

        <React.Fragment key="xhome">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              {t('XchomeSettings')}
            </Text>
          </View>

          {xhome.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}
        </React.Fragment>

        <React.Fragment key="sensor">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              {t('SensorSettings')}
            </Text>
          </View>

          {sensor.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}
        </React.Fragment>

        <React.Fragment key="dualsense">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              {t('DualSense')}
            </Text>
          </View>

          {renderItem(
            t('DualSense_adaptive_trigger_left'),
            `${t('DualSense_adaptive_trigger_left_desc')}`,
            () =>
              navigation.navigate({
                name: 'Ds5',
                params: {
                  type: 'left',
                },
              }),
            'ds5_left',
          )}

          {renderItem(
            t('DualSense_adaptive_trigger_right'),
            `${t('DualSense_adaptive_trigger_right_desc')}`,
            () =>
              navigation.navigate({
                name: 'Ds5',
                params: {
                  type: 'right',
                },
              }),
            'ds5_right',
          )}
        </React.Fragment>

        <React.Fragment key="server">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              🌐 {t('TurnServerSettings')}
            </Text>
          </View>

          {server.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}
          {renderItem(
            t('TURN server'),
            t('Custom TURN server'),
            () => navigation.navigate('Server'),
            'turn_server',
          )}
        </React.Fragment>

        <React.Fragment key="others">
          <View style={styles.contentTitle}>
            <Text variant="titleLarge" style={titleTextStyle}>
              {t('Others')}
            </Text>
          </View>

          {others.map((meta, idx) =>
            renderItem(
              meta.title,
              meta.description,
              () => handleItemPress(meta.name),
              meta.name || idx,
            ),
          )}

          {renderItem(
            t('Clear Cache'),
            t('Clear XStreaming Cache Data(Keep login data)'),
            () => handleClearCache(),
            'clear_cache',
          )}

          {renderItem(
            t('ConfigTransfer'),
            t('ConfigTransferDescription'),
            () => navigation.navigate('Transfer'),
            'transfer',
          )}

          {renderItem(
            t('Device testing'),
            t('Testing current device and controller'),
            () => navigation.navigate('DeviceInfos'),
            'device_infos',
          )}

          {renderItem(
            t('About'),
            `${t('About XStreaming')}`,
            () => {
              if (currentLanguage === 'zh' || currentLanguage === 'zht') {
                navigation.navigate('AboutZh');
              } else {
                navigation.navigate('About');
              }
            },
            'about',
          )}

          {(currentLanguage === 'zh' || currentLanguage === 'zht') &&
            renderItem(
              '支持及交流',
              '支持开发或交流使用心得',
              () => navigation.navigate('Feedback'),
              'feedback',
            )}

          {__DEV__ &&
            renderItem(
              'DEBUG',
              'Enter debug',
              () => handleItemPress('debug'),
              'debug',
            )}

          {renderItem(
            t('HistoryTitle'),
            `${t('HistoryDesc')}`,
            () => navigation.navigate('History'),
            'history',
          )}

          {renderItem(t('Thanks'), undefined, () => navigation.navigate('Thanks'), 'thanks')}

          {isAuthed
            ? renderItem(
                t('Logout'),
                user ? `${t('Current user')}: ${user}` : undefined,
                () => handleItemPress('logout'),
                'logout',
              )
            : null}
        </React.Fragment>

        <View style={styles.version}>
          <Text style={styles.versionText} variant="titleMedium">
            {t('Version')}: v{pkg.version}
          </Text>
          <Text style={styles.versionText} variant="titleSmall">
            © 2024-{new Date().getFullYear()} Geocld
          </Text>
        </View>
      </ScrollView>

      <GamepadFooterHints
        visible={isGamepadActive || Platform.isTV}
        hints={[
          {button: 'A', label: t('Select')},
          {button: 'B', label: t('Back')},
        ]}
      />
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
    color: '#fff',
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
