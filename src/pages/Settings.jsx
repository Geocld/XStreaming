import React from 'react';
import {StyleSheet, ScrollView, Alert, View} from 'react-native';
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

const log = debugFactory('SettingsScreen');

function SettingsScreen({navigation}) {
  const {t} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const profile = useSelector(state => state.profile);

  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    log.info('settings page show');
  }, [navigation]);

  const handleItemPress = id => {
    console.log('id:', id);
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
