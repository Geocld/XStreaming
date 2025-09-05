import React from 'react';
import {StyleSheet, View, ScrollView, ToastAndroid} from 'react-native';
import {Button, TextInput, Text} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../store/settingStore';

function ServerScreen({navigation, route}) {
  const {t, i18n} = useTranslation();
  const [url, setUrl] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    const settings = getSettings();
    setUrl(settings.server_url);
    setUsername(settings.server_username);
    setPassword(settings.server_credential);
  }, [navigation]);

  const handleSave = () => {
    if (url && !url.startsWith('turn:')) {
      ToastAndroid.show(t('UrlIncorrect'), ToastAndroid.SHORT);
      return;
    }
    const settings = getSettings();
    settings.server_url = url;
    settings.server_username = username;
    settings.server_credential = password;

    saveSettings(settings);

    ToastAndroid.show(t('Saved'), ToastAndroid.SHORT);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.tips}>
          <Text>{t('Custom TURN server')}</Text>
        </View>
        <TextInput
          label={t('URL')}
          value={url}
          onChangeText={value => setUrl(value)}
        />
        <TextInput
          label={t('Username')}
          value={username}
          onChangeText={value => setUsername(value)}
        />
        <TextInput
          label={t('Password')}
          value={password}
          onChangeText={value => setPassword(value)}
        />
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button mode="elevated" style={styles.button} onPress={handleSave}>
          {t('Save')}
        </Button>
        <Button
          mode="text"
          style={styles.button}
          onPress={() => navigation.goBack()}>
          {t('Back')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    flex: 1,
  },
  tips: {
    padding: 10,
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 20,
    paddingLeft: 10,
    paddingRight: 10,
  },
  button: {
    marginTop: 10,
  },
});

export default ServerScreen;
