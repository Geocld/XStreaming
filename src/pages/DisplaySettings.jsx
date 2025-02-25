import React from 'react';
import {StyleSheet, View, ScrollView, Image} from 'react-native';
import {Text, Button} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import {getSettings, saveSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import Display from '../components/Display';
import {debugFactory} from '../utils/debug';

const log = debugFactory('DisplaySettingsScreen');

function DisplaySettings({navigation, route}) {
  const {t} = useTranslation();

  const [settings, setSettings] = React.useState({});
  const [options, setOptions] = React.useState({});

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    if (_settings.display_options) {
      setOptions(_settings.display_options);
    }
  }, [navigation]);

  const handleChange = _options => {
    setOptions(_options);
  };

  const handleSave = () => {
    settings.display_options = options;
    saveSettings(settings);
    navigation.goBack();
  };

  const handleReset = () => {
    setOptions({
      sharpness: 5,
      saturation: 100,
      contrast: 100,
      brightness: 100,
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.displayWrap}>
        <Display options={options} onChange={handleChange} />
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button mode="contained" onPress={handleSave}>
          {t('Save')}
        </Button>
        <Button mode="outlined" style={styles.button} onPress={handleReset}>
          {t('Reset')}
        </Button>
        <Button
          mode="outlined"
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
    flex: 1,
  },
  displayWrap: {
    paddingTop: 30,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 230,
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

export default DisplaySettings;
