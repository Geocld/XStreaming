import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {Button, Searchbar, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {
  useGamepadActiveState,
  useGamepadNavigation,
} from '../utils/useGamepadNavigation';
import GamepadFooterHints, {
  GamepadHintItem,
} from '../components/GamepadFooterHints';
import {normalizeHexColor} from '../utils/themeColor';

type SearchFocusTarget = 'input' | 'confirm' | 'back';

interface SearchScreenProps {
  navigation: any;
  route: {
    params?: {
      keyword?: string;
    };
  };
}

function SearchScreen({navigation, route}: SearchScreenProps) {
  const {t} = useTranslation();
  const theme = useTheme();
  const isLight = theme.dark === false;
  const primaryColor = normalizeHexColor(theme.colors.primary);

  const {width, height} = useWindowDimensions();
  const isLandscape = width > height;

  const [keyword, setKeyword] = useState<string>('');
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState();
  const [focusedItem, setFocusedItem] = useState<SearchFocusTarget>('input');
  const searchInputRef = useRef<any>(null);

  useEffect(() => {
    if (route.params?.keyword) {
      setKeyword(route.params.keyword);
    }
  }, [route.params?.keyword]);

  const handleConfirm = useCallback(() => {
    Keyboard.dismiss();
    navigation.navigate({
      name: 'Cloud',
      params: {keyword},
      merge: true,
    });
  }, [keyword, navigation]);

  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  const handleClear = useCallback(() => {
    setKeyword('');
  }, []);

  const handleTouchDeactivate = useCallback(() => {
    if (!Platform.isTV) {
      setIsGamepadActive(false);
    }
  }, [setIsGamepadActive]);

  useGamepadNavigation({
    onDown: () => {
      Keyboard.dismiss();
      if (focusedItem === 'input') {
        setFocusedItem('confirm');
      } else if (focusedItem === 'confirm') {
        setFocusedItem('back');
      }
    },
    onUp: () => {
      Keyboard.dismiss();
      if (focusedItem === 'back') {
        setFocusedItem('confirm');
      } else if (focusedItem === 'confirm') {
        setFocusedItem('input');
      }
    },
    onSelect: () => {
      if (focusedItem === 'input') {
        searchInputRef.current?.focus();
      } else if (focusedItem === 'confirm') {
        handleConfirm();
      } else if (focusedItem === 'back') {
        handleBack();
      }
    },
    onActionX: () => {
      if (keyword) {
        handleClear();
      }
    },
    onBack: handleBack,
  });

  const gamepadHints: GamepadHintItem[] = useMemo(() => {
    const hints: GamepadHintItem[] = [];

    if (focusedItem === 'input') {
      hints.push({button: 'A', label: t('Search')});
    } else if (focusedItem === 'confirm') {
      hints.push({button: 'A', label: t('Confirm')});
    } else {
      hints.push({button: 'A', label: t('Back')});
    }

    if (keyword.length > 0) {
      hints.push({button: 'X', label: t('Clear')});
    }

    hints.push({button: 'B', label: t('Back')});
    return hints;
  }, [focusedItem, keyword, t]);

  const isInputFocused = isGamepadActive && focusedItem === 'input';
  const isConfirmFocused = isGamepadActive && focusedItem === 'confirm';
  const isBackFocused = isGamepadActive && focusedItem === 'back';

  const activeFocusBorderColor = isLight ? primaryColor : '#FFFFFF';

  return (
    <View
      style={styles.root}
      onTouchStart={handleTouchDeactivate}>
      <View
        style={[styles.container, isLandscape && styles.containerLandscape]}>
        <Searchbar
          ref={searchInputRef}
          autoFocus={!Platform.isTV}
          placeholder={t('Search')}
          style={[
            styles.searchbar,
            isLight && styles.searchbarLight,
            isInputFocused && [
              styles.searchbarFocused,
              {borderColor: activeFocusBorderColor},
            ],
          ]}
          inputStyle={styles.searchInput}
          onChangeText={setKeyword}
          value={keyword}
          onSubmitEditing={handleConfirm}
          onFocus={() => {
            if (isGamepadActive) {
              setFocusedItem('input');
            }
          }}
        />

        <View style={styles.buttonsWrap}>
          <Button
            mode="elevated"
            style={[
              styles.button,
              isConfirmFocused && [
                styles.buttonFocused,
                {borderColor: activeFocusBorderColor},
              ],
            ]}
            onPress={handleConfirm}>
            {t('Confirm')}
          </Button>

          <Button
            mode="text"
            style={[
              styles.button,
              isBackFocused && [
                styles.buttonFocused,
                {borderColor: activeFocusBorderColor},
              ],
            ]}
            onPress={handleBack}>
            {t('Back')}
          </Button>
        </View>
      </View>

      <GamepadFooterHints
        visible={isGamepadActive || Platform.isTV}
        hints={gamepadHints}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    padding: 20,
    width: '100%',
  },
  containerLandscape: {
    maxWidth: 520,
    alignSelf: 'center',
    paddingTop: 10,
  },
  searchbar: {
    marginTop: 30,
    height: 46,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  searchbarLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  searchbarFocused: {
    borderWidth: 2.5,
    transform: [{scale: 1.02}],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  searchInput: {
    minHeight: 0,
    alignSelf: 'center',
  },
  buttonsWrap: {
    marginTop: 24,
  },
  button: {
    marginBottom: 12,
    borderRadius: 12,
  },
  buttonFocused: {
    borderWidth: 2.5,
    transform: [{scale: 1.03}],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
});

export default SearchScreen;
