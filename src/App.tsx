import React from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Linking,
  useColorScheme,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  Dialog,
  PaperProvider,
  MD3DarkTheme,
  MD3LightTheme,
  Portal,
  ProgressBar,
  Text,
  adaptNavigationTheme,
} from 'react-native-paper';

import {createStackNavigator} from '@react-navigation/stack';
import {
  NavigationContainer,
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';

import merge from 'deepmerge';
import {Provider} from 'react-redux';
import store from './store';
import {getSettings, saveSettings} from './store/settingStore';
import {saveServerData} from './store/serverStore';

import customLightTheme from './theme/index';
import customDarkTheme from './theme/index.dark';

import HomeScreen from './pages/Home';
import CloudScreen from './pages/Cloud';
import FriendsScreen from './pages/Friends';
import AchivementScreen from './pages/Achivements';
import AchivementDetailScreen from './pages/ArchivementDetail';
import LoginScreen from './pages/Login';
import StreamScreen from './pages/Stream';
import NativeStreamScreen from './pages/NativeStream';
import SettingsScreen from './pages/Settings';
import SettingDetailScreen from './pages/SettingDetail';
import TitleDetailScreen from './pages/TitleDetail';
import DebugScreen from './pages/Debug';
import GameMapScreen from './pages/GameMap';
import NativeGameMapScreen from './pages/NativeGameMap';
import GameMapDetailScreen from './pages/GameMapDetail';
import DisplaySettingsScreen from './pages/DisplaySettings';
import AboutScreen from './pages/About';
import AboutZhScreen from './pages/AboutZh';
import FeedbackScreen from './pages/Feedback';
import VirtualGamepadSettingsScreen from './pages/VirtualGamepadSettings';
import CustomGamepadScreen from './pages/CustomGamepad';
import HoldButtonsScreen from './pages/HoldButtons';
import VirtualMacroSettingsScreen from './pages/VirtualMacroSettings';
import Ds5SettingsScreen from './pages/Ds5Settings';
import DeviceInfosScreen from './pages/DeviceInfos';
import ThanksScreen from './pages/Thanks';
import HistoryScreen from './pages/History';
import ServerScreen from './pages/Server';
import updater from './utils/updater';
import getServer from './utils/get-server';
import {
  applyPrimaryColorToPaperTheme,
  DEFAULT_THEME_PRIMARY_COLOR,
  normalizeHexColor,
} from './utils/themeColor';
import XboxSymbolBackground from './components/XboxSymbolBackground';

import {useTranslation} from 'react-i18next';

import {SystemBars} from 'react-native-edge-to-edge';

import './i18n';
import SearchScreen from './pages/Search';

const RootStack = createStackNavigator();

const {UsbRumbleManager, FullScreenManager, UpdateManager} = NativeModules;
const UPDATE_PROGRESS_EVENT = 'UpdateManagerProgress';

const formatUpdateBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) {
    return '0 MB';
  }

  const mb = bytes / 1024 / 1024;
  return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} MB`;
};

const {LightTheme, DarkTheme} = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const PAGE_BACKGROUND_LIGHT = '#FCFBFF';
const PAGE_BACKGROUND_DARK = '#111320';

const withPageBackground = (ScreenComponent: any) => {
  const WrappedScreen = (props: any) => {
    const colorScheme = useColorScheme();
    const settings = getSettings();
    const isLight =
      settings.theme === 'light' ||
      (settings.theme === 'auto' && colorScheme === 'light');

    return (
      <View
        style={[
          styles.backgroundScreen,
          isLight ? styles.backgroundScreenLight : styles.backgroundScreenDark,
        ]}>
        <XboxSymbolBackground isLight={isLight} />
        <View style={styles.backgroundContent}>
          <ScreenComponent {...props} />
        </View>
      </View>
    );
  };

  WrappedScreen.displayName = `WithPageBackground(${
    ScreenComponent.displayName || ScreenComponent.name || 'Screen'
  })`;
  return WrappedScreen;
};

const HomeBackgroundScreen = withPageBackground(HomeScreen);
const CloudBackgroundScreen = withPageBackground(CloudScreen);
const FriendsBackgroundScreen = withPageBackground(FriendsScreen);
const AchivementBackgroundScreen = withPageBackground(AchivementScreen);
const AchivementDetailBackgroundScreen = withPageBackground(
  AchivementDetailScreen,
);
const LoginBackgroundScreen = withPageBackground(LoginScreen);
const SettingsBackgroundScreen = withPageBackground(SettingsScreen);
const SettingDetailBackgroundScreen = withPageBackground(SettingDetailScreen);
const TitleDetailBackgroundScreen = withPageBackground(TitleDetailScreen);
const DebugBackgroundScreen = withPageBackground(DebugScreen);
const GameMapBackgroundScreen = withPageBackground(GameMapScreen);
const NativeGameMapBackgroundScreen = withPageBackground(NativeGameMapScreen);
const GameMapDetailBackgroundScreen = withPageBackground(GameMapDetailScreen);
const DisplaySettingsBackgroundScreen = withPageBackground(
  DisplaySettingsScreen,
);
const AboutBackgroundScreen = withPageBackground(AboutScreen);
const AboutZhBackgroundScreen = withPageBackground(AboutZhScreen);
const FeedbackBackgroundScreen = withPageBackground(FeedbackScreen);
const VirtualGamepadSettingsBackgroundScreen = withPageBackground(
  VirtualGamepadSettingsScreen,
);
const HoldButtonsBackgroundScreen = withPageBackground(HoldButtonsScreen);
const VirtualMacroSettingsBackgroundScreen = withPageBackground(
  VirtualMacroSettingsScreen,
);
const Ds5SettingsBackgroundScreen = withPageBackground(Ds5SettingsScreen);
const DeviceInfosBackgroundScreen = withPageBackground(DeviceInfosScreen);
const ThanksBackgroundScreen = withPageBackground(ThanksScreen);
const HistoryBackgroundScreen = withPageBackground(HistoryScreen);
const ServerBackgroundScreen = withPageBackground(ServerScreen);
const SearchBackgroundScreen = withPageBackground(SearchScreen);

function App() {
  const {t} = useTranslation();
  const colorScheme = useColorScheme();
  const settings = getSettings();
  const deviceInfos = FullScreenManager.getDeviceInfos();
  const updateCheckedRef = React.useRef(false);
  const [updateProgressVisible, setUpdateProgressVisible] =
    React.useState(false);
  const [updateProgress, setUpdateProgress] = React.useState({
    downloadedBytes: 0,
    progress: 0,
    status: 'idle',
    totalBytes: 0,
  });

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      UPDATE_PROGRESS_EVENT,
      (event: any) => {
        setUpdateProgress({
          downloadedBytes: Number(event?.downloadedBytes) || 0,
          progress: Number(event?.progress) || 0,
          status: event?.status || 'downloading',
          totalBytes: Number(event?.totalBytes) || 0,
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!settings.check_update || updateCheckedRef.current) {
      return;
    }

    updateCheckedRef.current = true;
    updater().then((infos: any) => {
      if (infos) {
        const {latestVer, version, updateText, pageUrl, apkUrl, apkName, url} =
          infos;
        const updateUrl = pageUrl || url;
        const buttons: any[] = [
          {
            text: t('Cancel'),
            style: 'default',
            onPress: () => {},
          },
          {
            text: t('Manual download'),
            style: 'default',
            onPress: () => {
              Linking.openURL(updateUrl).catch(_ => {});
            },
          },
        ];

        if (apkUrl) {
          buttons.push({
            text: t('Auto install'),
            style: 'default',
            onPress: () => {
              const showAutoInstallError = (e?: any) => {
                setUpdateProgressVisible(false);
                const message =
                  e?.code === 'INSTALL_PERMISSION_REQUIRED'
                    ? t('InstallPermissionRequired')
                    : t('AutoInstallFailed');
                Alert.alert(t('Warning'), message, [
                  {
                    text: t('Manual download'),
                    style: 'default',
                    onPress: () => {
                      Linking.openURL(updateUrl).catch(_ => {});
                    },
                  },
                  {
                    text: t('Confirm'),
                    style: 'cancel',
                  },
                ]);
              };

              if (!UpdateManager?.downloadAndInstall) {
                showAutoInstallError();
                return;
              }

              setUpdateProgress({
                downloadedBytes: 0,
                progress: 0,
                status: 'downloading',
                totalBytes: 0,
              });
              setUpdateProgressVisible(true);
              UpdateManager.downloadAndInstall(apkUrl, apkName).catch(
                showAutoInstallError,
              );
            },
          });
        }

        Alert.alert(
          t('Update Warning'),
          t(
            `Check new version ${latestVer}, current version is ${version}. \n ${updateText}`,
          ),
          buttons,
        );
      }
    });
  }, [settings.check_update, t]);

  React.useEffect(() => {
    if (settings.bind_usb_device !== undefined) {
      UsbRumbleManager.setBindUsbDevice(settings.bind_usb_device);
    }
  }, [settings.bind_usb_device]);

  React.useEffect(() => {
    getServer().then((data: any) => {
      if (data && data.url && data.username && data.credential) {
        saveServerData(data);
      }
    });
  }, []);

  const primaryColor = normalizeHexColor(
    settings.theme_primary_color,
    DEFAULT_THEME_PRIMARY_COLOR,
  );
  const paperLightTheme = applyPrimaryColorToPaperTheme(
    {
      ...MD3LightTheme,
      colors: customLightTheme.colors,
    },
    'light',
    primaryColor,
  );
  const paperDarkTheme = applyPrimaryColorToPaperTheme(
    {
      ...MD3DarkTheme,
      colors: customDarkTheme.colors,
    },
    'dark',
    primaryColor,
  );
  const CombinedDefaultTheme = merge(paperLightTheme, LightTheme);
  const CombinedDarkTheme = merge(paperDarkTheme, DarkTheme);
  CombinedDefaultTheme.colors.background = PAGE_BACKGROUND_LIGHT;
  CombinedDefaultTheme.colors.card = PAGE_BACKGROUND_LIGHT;
  CombinedDarkTheme.colors.background = PAGE_BACKGROUND_DARK;
  CombinedDarkTheme.colors.card = PAGE_BACKGROUND_DARK;

  let paperTheme = paperDarkTheme;
  let navigationTheme = CombinedDarkTheme;

  if (settings.theme === 'auto') {
    paperTheme = colorScheme === 'dark' ? paperDarkTheme : paperLightTheme;
    navigationTheme =
      colorScheme === 'dark' ? CombinedDarkTheme : CombinedDefaultTheme;
  } else if (settings.theme === 'light') {
    paperTheme = paperLightTheme;
    navigationTheme = CombinedDefaultTheme;
  }

  if (
    deviceInfos.factor?.toLocaleUpperCase().indexOf('NINTENDO') > -1 &&
    deviceInfos.model?.toLocaleUpperCase().indexOf('SWITCHLITE') > -1
  ) {
    if (!settings.short_trigger) {
      settings.short_trigger = true;
      saveSettings(settings);
    }
  }

  const hasDownloadTotal = updateProgress.totalBytes > 0;
  const normalizedUpdateProgress = hasDownloadTotal
    ? Math.max(0, Math.min(updateProgress.progress, 1))
    : 0;
  const updateProgressPercent = Math.round(normalizedUpdateProgress * 100);
  const updateProgressText =
    updateProgress.status === 'installing' ||
    updateProgress.status === 'completed'
      ? t('Preparing installation')
      : hasDownloadTotal
      ? `${t('Downloaded')} ${updateProgressPercent}% (${formatUpdateBytes(
          updateProgress.downloadedBytes,
        )} / ${formatUpdateBytes(updateProgress.totalBytes)})`
      : `${t('Downloaded')} ${formatUpdateBytes(
          updateProgress.downloadedBytes,
        )}`;

  return (
    <>
      <Provider store={store}>
        <PaperProvider theme={paperTheme}>
          <NavigationContainer theme={navigationTheme}>
            <RootStack.Navigator>
              <RootStack.Group>
                <RootStack.Screen
                  name="Home"
                  component={HomeBackgroundScreen}
                  options={{
                    headerShown: false,
                    cardStyle: styles.transparentCard,
                  }}
                />
                <RootStack.Screen
                  name="Cloud"
                  component={CloudBackgroundScreen}
                  options={{title: t('Xcloud')}}
                />
                <RootStack.Screen
                  name="Settings"
                  component={SettingsBackgroundScreen}
                  options={{title: t('Settings')}}
                />
                <RootStack.Screen
                  name="Login"
                  component={LoginBackgroundScreen}
                  options={{title: t('Login')}}
                />
                <RootStack.Screen
                  name="Stream"
                  component={StreamScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="NativeStream"
                  component={NativeStreamScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="CustomGamepad"
                  component={CustomGamepadScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="VirtualGamepadSettings"
                  component={VirtualGamepadSettingsBackgroundScreen}
                  options={{title: t('Custom')}}
                />
                <RootStack.Screen
                  name="HoldButtons"
                  component={HoldButtonsBackgroundScreen}
                  options={{title: t('Hold Buttons')}}
                />
                <RootStack.Screen
                  name="VirtualMacroSettings"
                  component={VirtualMacroSettingsBackgroundScreen}
                  options={{title: t('Virtual macro settings')}}
                />
                <RootStack.Screen
                  name="Display"
                  component={DisplaySettingsBackgroundScreen}
                  options={{title: t('Display')}}
                />
                <RootStack.Screen
                  name="Search"
                  component={SearchBackgroundScreen}
                  options={{title: t('Search'), headerShown: false}}
                />
                <RootStack.Screen
                  name="Friends"
                  component={FriendsBackgroundScreen}
                  options={{title: t('Friends')}}
                />
                <RootStack.Screen
                  name="Achivements"
                  component={AchivementBackgroundScreen}
                  options={{title: t('Achivements')}}
                />
                <RootStack.Screen
                  name="About"
                  component={AboutBackgroundScreen}
                  options={{title: t('About')}}
                />
                <RootStack.Screen
                  name="AboutZh"
                  component={AboutZhBackgroundScreen}
                  options={{title: t('About')}}
                />
                <RootStack.Screen
                  name="Feedback"
                  component={FeedbackBackgroundScreen}
                  options={{title: t('Feedback')}}
                />
                <RootStack.Screen
                  name="Thanks"
                  component={ThanksBackgroundScreen}
                  options={{title: t('Thanks')}}
                />
                <RootStack.Screen
                  name="History"
                  component={HistoryBackgroundScreen}
                  options={{title: t('HistoryTitle')}}
                />
                <RootStack.Screen
                  name="Server"
                  component={ServerBackgroundScreen}
                  options={{title: t('Server')}}
                />
                <RootStack.Screen
                  name="GameMap"
                  component={GameMapBackgroundScreen}
                  options={{title: t('GameMap')}}
                />
                <RootStack.Screen
                  name="SettingDetail"
                  component={SettingDetailBackgroundScreen}
                />
                <RootStack.Screen
                  name="NativeGameMap"
                  component={NativeGameMapBackgroundScreen}
                  options={{title: t('GameMap')}}
                />
                <RootStack.Screen
                  name="Ds5"
                  component={Ds5SettingsBackgroundScreen}
                  options={{title: t('DualSense')}}
                />
                <RootStack.Screen
                  name="DeviceInfos"
                  component={DeviceInfosBackgroundScreen}
                  options={{title: t('Device testing')}}
                />
                <RootStack.Screen
                  name="Debug"
                  component={DebugBackgroundScreen}
                />
              </RootStack.Group>

              <RootStack.Group screenOptions={{presentation: 'modal'}}>
                <RootStack.Screen
                  name="TitleDetail"
                  component={TitleDetailBackgroundScreen}
                />
                <RootStack.Screen
                  name="AchivementDetail"
                  component={AchivementDetailBackgroundScreen}
                />
                <RootStack.Screen
                  name="GameMapDetail"
                  component={GameMapDetailBackgroundScreen}
                  options={{title: t('GameMap')}}
                />
              </RootStack.Group>
            </RootStack.Navigator>
          </NavigationContainer>
          <Portal>
            <Dialog
              visible={updateProgressVisible}
              onDismiss={() => setUpdateProgressVisible(false)}>
              <Dialog.Title>{t('Update download')}</Dialog.Title>
              <Dialog.Content>
                <Text style={styles.updateProgressText}>
                  {updateProgressText}
                </Text>
                <ProgressBar
                  progress={normalizedUpdateProgress}
                  indeterminate={!hasDownloadTotal}
                />
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setUpdateProgressVisible(false)}>
                  {t('Hide')}
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </PaperProvider>
      </Provider>
      <SystemBars style="light" hidden={false} />
    </>
  );
}

const styles = StyleSheet.create({
  backgroundScreen: {
    flex: 1,
  },
  backgroundScreenLight: {
    backgroundColor: PAGE_BACKGROUND_LIGHT,
  },
  backgroundScreenDark: {
    backgroundColor: PAGE_BACKGROUND_DARK,
  },
  backgroundContent: {
    flex: 1,
  },
  transparentCard: {
    backgroundColor: 'transparent',
  },
  updateProgressText: {
    marginBottom: 12,
  },
});

export default App;
