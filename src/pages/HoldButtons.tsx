import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text, Divider, Button, Checkbox} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../store/settingStore';

function HoldButtonsScreen({navigation}) {
  const {t} = useTranslation();
  const [settings, setSettings] = React.useState<any>({});
  const [buttons, setButtons] = React.useState<any>([]);

  React.useEffect(() => {
    const _buttons = [
      {name: 'A', check: false},
      {name: 'B', check: false},
      {name: 'X', check: false},
      {name: 'Y', check: false},
      {name: 'LeftShoulder', check: false},
      {name: 'RightShoulder', check: false},
      {name: 'LeftTrigger', check: false},
      {name: 'RightTrigger', check: false},
      {name: 'View', check: false},
      {name: 'Menu', check: false},
      {name: 'LeftThumb', check: false},
      {name: 'RightThumb', check: false},
      {name: 'DPadUp', check: false},
      {name: 'DPadDown', check: false},
      {name: 'DPadLeft', check: false},
      {name: 'DPadRight', check: false},
    ];
    const _settings = getSettings();
    const hold_buttons: any = _settings.hold_buttons || [];
    const newButtons = _buttons.map((b: any) => ({
      ...b,
      check: hold_buttons.includes(b.name),
    }));
    setButtons(newButtons);
    setSettings(_settings);
  }, []);

  const handleConfirm = () => {
    const hold_buttons = buttons.filter(b => b.check).map(b => b.name);
    const newSettings = {...settings, hold_buttons};
    setSettings(newSettings);
    saveSettings(newSettings);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.tips}>
          <Text>{t('HoldButtonsSettingsDesc')}</Text>
        </View>
        <Divider />

        {buttons.map((button, index) => (
          <Checkbox.Item
            key={button.name}
            label={button.name}
            status={button.check ? 'checked' : 'unchecked'}
            onPress={() => {
              const newButtons = [...buttons];
              newButtons[index].check = !newButtons[index].check;
              setButtons(newButtons);
            }}
          />
        ))}
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button mode="elevated" style={styles.button} onPress={handleConfirm}>
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
    flex: 1,
  },
  tips: {
    padding: 10,
  },
  scrollView: {
    marginBottom: 120,
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
    marginBottom: 10,
  },
});

export default HoldButtonsScreen;
