import React from 'react';
import {Alert, Linking, useColorScheme, NativeModules} from 'react-native';
import {
  PaperProvider,
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {createStackNavigator} from '@react-navigation/stack';
import {
  NavigationContainer,
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import merge from 'deepmerge';
import {Provider} from 'react-redux';
import store from './store';
import {getSettings} from './store/settingStore';

import customLightTheme from './theme/index';
import customDarkTheme from './theme/index.dark';

import HomeScreen from './pages/Home';
import CloudScreen from './pages/Cloud';
import FriendsScreen from './pages/Friends';
import AchivementScreen from './pages/Achivements';
import AchivementDetailScreen from './pages/ArchivementDetail';
import LoginScreen from './pages/Login';
import StreamScreen from './pages/Stream';
import SettingsScreen from './pages/Settings';
import SettingDetailScreen from './pages/SettingDetail';
import TitleDetailScreen from './pages/TitleDetail';
import DebugScreen from './pages/Debug';
import GameMapScreen from './pages/GameMap';
import NativeGameMapScreen from './pages/NativeGameMap';
import GameMapDetailScreen from './pages/GameMapDetail';
import DisplaySettingsScreen from './pages/DisplaySettings';
import AboutScreen from './pages/About';
import FeedbackScreen from './pages/Feedback';
import VirtualGamepadSettingsScreen from './pages/VirtualGamepadSettings';
import CustomGamepadScreen from './pages/CustomGamepad';
import updater from './utils/updater';

import {useTranslation} from 'react-i18next';

import './i18n';
import SearchScreen from './pages/Search';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const {UsbRumbleManager} = NativeModules;

const {LightTheme, DarkTheme} = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const paperLightTheme = {
  ...MD3LightTheme,
  colors: customLightTheme.colors,
};

const paperDarkTheme = {
  ...MD3DarkTheme,
  colors: customDarkTheme.colors,
};

const CombinedDefaultTheme = merge(paperLightTheme, LightTheme);
const CombinedDarkTheme = merge(paperDarkTheme, DarkTheme);

const TabIcon = (route: any, params: any) => {
  const {focused, color, size} = params;
  let iconName;
  if (route.name === 'Home') {
    iconName = focused ? 'game-controller' : 'game-controller-outline';
  } else if (route.name === 'Settings') {
    iconName = focused ? 'settings' : 'settings-outline';
  } else if (route.name === 'Cloud') {
    iconName = 'logo-xbox';
  } else if (route.name === 'Friends') {
    iconName = 'people-outline';
  } else if (route.name === 'Achivements') {
    iconName = 'ribbon-outline';
  }
  return <Ionicons name={iconName} size={size} color={color} />;
};

function HomeTabs() {
  const {t} = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({focused, color, size}) =>
          TabIcon(route, {focused, color, size}),
        tabBarActiveTintColor: '#107C10',
        tabBarInactiveTintColor: 'gray',
      })}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{tabBarLabel: t('Consoles'), title: t('Consoles')}}
      />
      <Tab.Screen
        name="Cloud"
        component={CloudScreen}
        options={{
          headerShown: false,
          tabBarLabel: t('Xcloud'),
          title: t('Xcloud'),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          tabBarLabel: t('Friends'),
          title: t('Friends'),
        }}
      />
      <Tab.Screen
        name="Achivements"
        component={AchivementScreen}
        options={{
          tabBarLabel: t('Achivements'),
          title: t('Achivements'),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{tabBarLabel: t('Settings'), title: t('Settings')}}
      />
    </Tab.Navigator>
  );
}

function App() {
  const {t} = useTranslation();
  const colorScheme = useColorScheme();
  const settings = getSettings();

  if (settings.bind_usb_device !== undefined) {
    UsbRumbleManager.setBindUsbDevice(settings.bind_usb_device);
  }

  updater().then((infos: any) => {
    if (infos) {
      const {latestVer, version, url} = infos;
      Alert.alert(
        t('Warning'),
        t(`Check new version ${latestVer}, current version is ${version}`),
        [
          {
            text: t('Cancel'),
            style: 'default',
            onPress: () => {},
          },
          {
            text: t('Download'),
            style: 'default',
            onPress: () => {
              Linking.openURL(url).catch(_ => {});
            },
          },
        ],
      );
    }
  });

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

  return (
    <>
      <Provider store={store}>
        <PaperProvider theme={paperTheme}>
          <NavigationContainer theme={navigationTheme}>
            <RootStack.Navigator>
              <RootStack.Group>
                <RootStack.Screen
                  name="Main"
                  component={HomeTabs}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{title: t('Login')}}
                />
                <RootStack.Screen
                  name="Stream"
                  component={StreamScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen name="Debug" component={DebugScreen} />
                <RootStack.Screen
                  name="CustomGamepad"
                  component={CustomGamepadScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen
                  name="VirtualGamepadSettings"
                  component={VirtualGamepadSettingsScreen}
                />
                <RootStack.Screen
                  name="Display"
                  component={DisplaySettingsScreen}
                  options={{title: t('Display')}}
                />
                <RootStack.Screen
                  name="Search"
                  component={SearchScreen}
                  options={{title: t('Search'), headerShown: false}}
                />
                <RootStack.Screen
                  name="About"
                  component={AboutScreen}
                  options={{title: t('About')}}
                />
                <RootStack.Screen
                  name="Feedback"
                  component={FeedbackScreen}
                  options={{title: t('Feedback')}}
                />
                <RootStack.Screen
                  name="GameMap"
                  component={GameMapScreen}
                  options={{title: t('GameMap')}}
                />
                <RootStack.Screen
                  name="SettingDetail"
                  component={SettingDetailScreen}
                />
                <RootStack.Screen
                  name="NativeGameMap"
                  component={NativeGameMapScreen}
                  options={{title: t('GameMap')}}
                />
              </RootStack.Group>

              <RootStack.Group screenOptions={{presentation: 'modal'}}>
                <RootStack.Screen
                  name="TitleDetail"
                  component={TitleDetailScreen}
                />
                <RootStack.Screen
                  name="AchivementDetail"
                  component={AchivementDetailScreen}
                />
                <RootStack.Screen
                  name="GameMapDetail"
                  component={GameMapDetailScreen}
                  options={{title: t('GameMap')}}
                />
              </RootStack.Group>
            </RootStack.Navigator>
          </NavigationContainer>
        </PaperProvider>
      </Provider>
    </>
  );
}

export default App;
