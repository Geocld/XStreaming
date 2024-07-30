import React from 'react';
import * as eva from '@eva-design/eva';
import {Alert, Linking} from 'react-native';
import {ApplicationProvider, IconRegistry} from '@ui-kitten/components';
import {EvaIconsPack} from '@ui-kitten/eva-icons/index';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {createStackNavigator} from '@react-navigation/stack';
import {NavigationContainer} from '@react-navigation/native';
// import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import {Provider} from 'react-redux';
import store from './store';

import HomeScreen from './pages/Home';
import CloudScreen from './pages/Cloud';
import FriendsScreen from './pages/Friends';
import AchivementScreen from './pages/Achivements';
import AchivementDetailScreen from './pages/ArchivementDetail';
import LoginScreen from './pages/Login';
import StreamScreen from './pages/Stream';
import SettingsScreen from './pages/Settings';
import TitleDetailScreen from './pages/TitleDetail';
import DebugScreen from './pages/Debug';
import GameMapScreen from './pages/GameMap';
import NativeGameMapScreen from './pages/NativeGameMap';
import GameMapDetailScreen from './pages/GameMapDetail';
import GamepadDebugScreen from './pages/GamepadDebug';
import AboutScreen from './pages/About';
import updater from './utils/updater';

// Change theme: https://akveo.github.io/react-native-ui-kitten/docs/guides/branding#primary-color
import {default as theme} from '../theme.json';

import {useTranslation} from 'react-i18next';

import './i18n';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

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

const darkTheme = {
  dark: true,
  colors: {
    primary: 'black',
    background: 'black',
    card: 'black',
    text: 'white',
    border: 'gray',
    notification: 'orange',
  },
};

function App() {
  const {t} = useTranslation();
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
  return (
    <>
      <IconRegistry icons={EvaIconsPack} />
      <Provider store={store}>
        <ApplicationProvider {...eva} theme={{...eva.dark, ...theme}}>
          <NavigationContainer theme={darkTheme}>
            <RootStack.Navigator>
              <RootStack.Group>
                <RootStack.Screen
                  name="Main"
                  component={HomeTabs}
                  options={{headerShown: false}}
                />
                <RootStack.Screen name="Login" component={LoginScreen} />
                <RootStack.Screen
                  name="Stream"
                  component={StreamScreen}
                  options={{headerShown: false}}
                />
                <RootStack.Screen name="Debug" component={DebugScreen} />
                <RootStack.Screen name="About" component={AboutScreen} />
                <RootStack.Screen name="GameMap" component={GameMapScreen} />
                <RootStack.Screen
                  name="NativeGameMap"
                  component={NativeGameMapScreen}
                />
                <RootStack.Screen
                  name="GamepadDebug"
                  component={GamepadDebugScreen}
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
                />
              </RootStack.Group>
            </RootStack.Navigator>
          </NavigationContainer>
        </ApplicationProvider>
      </Provider>
    </>
  );
}

export default App;
