import React from 'react';
import {StyleSheet, View, ScrollView, Platform} from 'react-native';
import {
  Button,
  IconButton,
  RadioButton,
  Text,
  Portal,
  Modal,
  Card,
  HelperText,
  TextInput,
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {
  getSettings as getUserSettings,
  saveSettings as saveUserSettings,
} from '../store/settingStore';
import {getSettings} from '../store/gamepadStore';
import {shiftColor} from '../utils/themeColor';
import {
  useGamepadNavigation,
  useGamepadActiveState,
} from '../utils/useGamepadNavigation';
import GamepadFooterHints from '../components/GamepadFooterHints';

function VirtualGamepadSettingsScreen({navigation}) {
  const {t} = useTranslation();
  const theme = useTheme();
  const [value, setValue] = React.useState('');
  const [name, setName] = React.useState('');
  const [userSettings, setUserSettings] = React.useState<any>({});
  const [settings, setSettings] = React.useState<any>([]);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    navigation.setOptions({
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <IconButton
          icon="plus"
          size={28}
          onPress={() => {
            setShowAddModal(true);
          }}
        />
      ),
    });

    const _settings = getSettings();
    setSettings(Object.keys(_settings));

    const _userSettings = getUserSettings();
    setUserSettings(_userSettings);
    setValue(_userSettings.custom_virtual_gamepad || '');
  }, [navigation]);

  const handleSave = () => {
    userSettings.custom_virtual_gamepad = value;
    setUserSettings(userSettings);
    saveUserSettings(userSettings);
    navigation.goBack();
  };

  const handleEdit = () => {
    navigation.navigate('CustomGamepad', {name: value});
  };

  const allOptions = React.useMemo(() => ['', ...settings], [settings]);
  const actionButtons = React.useMemo(() => {
    const btns: Array<{key: string; label: string; action: () => void}> = [
      {key: 'select', label: t('Select'), action: handleSave},
    ];
    if (value !== '') {
      btns.push({key: 'edit', label: t('Edit'), action: handleEdit});
    }
    btns.push({key: 'back', label: t('Back'), action: () => navigation.goBack()});
    return btns;
  }, [value, t, handleSave, handleEdit, navigation]);

  const totalCount = allOptions.length + actionButtons.length;

  React.useEffect(() => {
    if (focusedIndex < allOptions.length) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, focusedIndex * 48 - 80),
        animated: true,
      });
    } else {
      scrollViewRef.current?.scrollToEnd({animated: true});
    }
  }, [focusedIndex, allOptions.length]);

  useGamepadNavigation({
    priority: showAddModal ? 15 : 10,
    onUp: () => {
      if (showAddModal) return;
      setIsGamepadActive(true);
      setFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      if (showAddModal) return;
      setIsGamepadActive(true);
      setFocusedIndex(prev => Math.min(totalCount - 1, prev + 1));
    },
    onSelect: () => {
      if (showAddModal) return;
      setIsGamepadActive(true);
      if (focusedIndex < allOptions.length) {
        setValue(allOptions[focusedIndex]);
      } else {
        const btnIdx = focusedIndex - allOptions.length;
        if (actionButtons[btnIdx]) {
          actionButtons[btnIdx].action();
        }
      }
    },
    onBack: () => {
      if (showAddModal) {
        setShowAddModal(false);
      } else {
        navigation.goBack();
      }
    },
  });

  const onChangeText = text => setName(text);

  let errorText = '';
  let isError = false;
  if (!name.trim()) {
    isError = true;
    errorText = t('Name can not be empty');
  }

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
    <View
      style={styles.container}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <Portal>
        <Modal
          visible={showAddModal}
          onDismiss={() => setShowAddModal(false)}
          contentContainerStyle={styles.modal}>
          <Card>
            <Card.Content>
              <TextInput label="" value={name} onChangeText={onChangeText} />
              <HelperText type="error" visible={isError}>
                {errorText}
              </HelperText>

              <Button
                mode="contained"
                style={{marginTop: 20}}
                onPress={() => {
                  const _name = name;
                  if (!isError) {
                    setShowAddModal(false);
                    setName('');
                    setTimeout(() => {
                      navigation.navigate('CustomGamepad', {name: _name});
                    }, 300);
                  }
                }}>
                {t('Confirm')}
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>

      <ScrollView ref={scrollViewRef} style={styles.scrollView}>
        <Card style={heroCardStyle}>
          <Card.Content>
            <Text style={heroDescStyle}>
              {t('Customize buttons of virtual gamepad')}
            </Text>
            <Text style={heroHintStyle}>
              {t(
                'The position of custom virtual buttons may have discrepancies with actual rendering. Please refer to the actual effect for accuracy',
              )}
            </Text>
          </Card.Content>
        </Card>

        <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
          <View
            style={[
              styles.radioWrap,
              (isGamepadActive || Platform.isTV) &&
                focusedIndex === 0 &&
                styles.radioFocused,
            ]}>
            <RadioButton.Item
              label={t('Default')}
              value={''}
              onPress={() => {
                setFocusedIndex(0);
                setValue('');
              }}
            />
          </View>
          {settings.map((s, idx) => {
            const itemIdx = idx + 1;
            const isFocused =
              (isGamepadActive || Platform.isTV) && focusedIndex === itemIdx;
            return (
              <View
                key={s}
                style={[styles.radioWrap, isFocused && styles.radioFocused]}>
                <RadioButton.Item
                  label={s}
                  value={s}
                  onPress={() => {
                    setFocusedIndex(itemIdx);
                    setValue(s);
                  }}
                />
              </View>
            );
          })}
        </RadioButton.Group>
      </ScrollView>

      <View style={styles.buttonWrap}>
        {actionButtons.map((btn, bIdx) => {
          const btnFocusIdx = allOptions.length + bIdx;
          const isFocused =
            (isGamepadActive || Platform.isTV) && focusedIndex === btnFocusIdx;
          return (
            <Button
              key={btn.key}
              mode={isFocused ? 'contained' : btn.key === 'select' ? 'elevated' : btn.key === 'edit' ? 'outlined' : 'text'}
              buttonColor={isFocused ? theme.colors.primary : undefined}
              textColor={isFocused ? '#FFFFFF' : undefined}
              style={[styles.button, isFocused && styles.tvButtonFocused]}
              onPress={btn.action}>
              {btn.label}
            </Button>
          );
        })}
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
  scrollView: {
    marginBottom: 140,
  },
  radioWrap: {
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
  },
  radioFocused: {
    borderWidth: 2,
    borderColor: '#107C10',
    backgroundColor: 'rgba(16, 124, 16, 0.15)',
  },
  sliderTitle: {
    padding: 10,
  },
  slider: {
    width: '100%',
    height: 40,
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
    marginTop: 10,
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
  modal: {
    marginLeft: '10%',
    marginRight: '10%',
  },
});

export default VirtualGamepadSettingsScreen;

