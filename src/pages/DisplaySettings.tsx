import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Button, Card, Text, useTheme} from 'react-native-paper';
import {getSettings, saveSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import Display from '../components/Display';
import {shiftColor} from '../utils/themeColor';

function DisplaySettings({navigation}) {
  const {t} = useTranslation();
  const theme = useTheme();

  const [settings, setSettings] = React.useState<any>({});
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

  const heroCardStyle = React.useMemo(
    () => [
      styles.heroCard,
      {backgroundColor: shiftColor(theme.colors.primary, -0.82)},
    ],
    [theme.colors.primary],
  );
  const heroDescStyle = React.useMemo(
    () => [styles.heroDesc, {color: shiftColor(theme.colors.primary, 0.72)}],
    [theme.colors.primary],
  );
  const heroHintStyle = React.useMemo(
    () => [styles.heroHint, {color: shiftColor(theme.colors.primary, 0.55)}],
    [theme.colors.primary],
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.displayWrap}>
        <Card style={heroCardStyle}>
          <Card.Content>
            <Text style={heroDescStyle}>
              {t('Set parameters such as screen clarity and saturation')}
            </Text>
            <Text style={heroHintStyle}>
              {t('Display settings is not working in native render engine.')}
            </Text>
          </Card.Content>
        </Card>
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
    paddingTop: 12,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 230,
  },
  heroCard: {
    marginBottom: 12,
    backgroundColor: '#16351c',
  },
  heroDesc: {
    color: '#C0D8BF',
    lineHeight: 20,
  },
  heroHint: {
    color: '#a5c6a3',
    marginTop: 8,
    lineHeight: 18,
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
