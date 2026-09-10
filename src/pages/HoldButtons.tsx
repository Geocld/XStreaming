import React from 'react';
import {StyleSheet, View, ScrollView, Platform} from 'react-native';
import {
  Text,
  Divider,
  Button,
  Checkbox,
  Card,
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../store/settingStore';
import {shiftColor} from '../utils/themeColor';
import {
  useGamepadNavigation,
  useGamepadActiveState,
} from '../utils/useGamepadNavigation';
import GamepadFooterHints from '../components/GamepadFooterHints';

function HoldButtonsScreen({navigation}) {
  const {t} = useTranslation();
  const theme = useTheme();
  const [settings, setSettings] = React.useState<any>({});
  const [buttons, setButtons] = React.useState<any>([]);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

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

  const saveButtonIndex = buttons.length;
  const backButtonIndex = buttons.length + 1;
  const totalCount = buttons.length + 2;

  React.useEffect(() => {
    if (focusedIndex < buttons.length) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, focusedIndex * 48 - 80),
        animated: true,
      });
    } else {
      scrollViewRef.current?.scrollToEnd({animated: true});
    }
  }, [focusedIndex, buttons.length]);

  const handleConfirm = () => {
    const hold_buttons = buttons.filter(b => b.check).map(b => b.name);
    const newSettings = {...settings, hold_buttons};
    setSettings(newSettings);
    saveSettings(newSettings);
    navigation.goBack();
  };

  const toggleButton = (index: number) => {
    const newButtons = [...buttons];
    newButtons[index].check = !newButtons[index].check;
    setButtons(newButtons);
  };

  useGamepadNavigation({
    priority: 10,
    onUp: () => {
      setIsGamepadActive(true);
      setFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      setIsGamepadActive(true);
      setFocusedIndex(prev => Math.min(totalCount - 1, prev + 1));
    },
    onSelect: () => {
      setIsGamepadActive(true);
      if (focusedIndex < buttons.length) {
        toggleButton(focusedIndex);
      } else if (focusedIndex === saveButtonIndex) {
        handleConfirm();
      } else if (focusedIndex === backButtonIndex) {
        navigation.goBack();
      }
    },
    onBack: () => {
      navigation.goBack();
    },
  });

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

  return (
    <View
      style={styles.container}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <ScrollView ref={scrollViewRef} style={styles.scrollView}>
        <Card style={heroCardStyle}>
          <Card.Content>
            <Text style={heroDescStyle}>{t('HoldButtonsSettingsDesc')}</Text>
          </Card.Content>
        </Card>
        <Divider />

        {buttons.map((button, index) => {
          const isFocused =
            (isGamepadActive || Platform.isTV) && focusedIndex === index;
          return (
            <View
              key={button.name}
              style={[styles.itemWrap, isFocused && styles.itemFocused]}>
              <Checkbox.Item
                label={button.name}
                status={button.check ? 'checked' : 'unchecked'}
                onPress={() => {
                  setFocusedIndex(index);
                  toggleButton(index);
                }}
              />
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button
          mode={
            (isGamepadActive || Platform.isTV) && focusedIndex === saveButtonIndex
              ? 'contained'
              : 'elevated'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) && focusedIndex === saveButtonIndex
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) && focusedIndex === saveButtonIndex
              ? '#FFFFFF'
              : undefined
          }
          style={[
            styles.button,
            (isGamepadActive || Platform.isTV) &&
              focusedIndex === saveButtonIndex &&
              styles.tvButtonFocused,
          ]}
          onPress={handleConfirm}>
          {t('Save')}
        </Button>
        <Button
          mode={
            (isGamepadActive || Platform.isTV) && focusedIndex === backButtonIndex
              ? 'contained'
              : 'text'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) && focusedIndex === backButtonIndex
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) && focusedIndex === backButtonIndex
              ? '#FFFFFF'
              : undefined
          }
          style={[
            styles.button,
            (isGamepadActive || Platform.isTV) &&
              focusedIndex === backButtonIndex &&
              styles.tvButtonFocused,
          ]}
          onPress={() => navigation.goBack()}>
          {t('Back')}
        </Button>
      </View>

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
  tips: {
    padding: 10,
  },
  scrollView: {
    marginBottom: 140,
  },
  itemWrap: {
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
  },
  itemFocused: {
    borderWidth: 2,
    borderColor: '#107C10',
    backgroundColor: 'rgba(16, 124, 16, 0.15)',
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 30,
    paddingLeft: 10,
    paddingRight: 10,
  },
  button: {
    marginBottom: 10,
  },
  tvButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 6,
    shadowColor: '#107C10',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  heroCard: {
    margin: 12,
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
});

export default HoldButtonsScreen;

