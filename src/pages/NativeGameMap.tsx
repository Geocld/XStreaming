import React from 'react';
import {View, StyleSheet, FlatList, Platform} from 'react-native';
import {Button, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';
import MapItem from '../components/MapItem';
import {GAMEPAD_MAPING} from '../common';
import {
  useGamepadNavigation,
  useGamepadActiveState,
} from '../utils/useGamepadNavigation';
import GamepadFooterHints from '../components/GamepadFooterHints';

const log = debugFactory('NativeGameMapScreen');

const defaultMaping = GAMEPAD_MAPING;

const buttonLabels = [
  'A',
  'B',
  'X',
  'Y',
  'DPadUp',
  'DPadDown',
  'DPadLeft',
  'DPadRight',
  'LeftShoulder',
  'RightShoulder',
  'LeftTrigger',
  'RightTrigger',
  'LeftThumb',
  'RightThumb',
  'View',
  'Menu',
  'Nexus',
];

function NativeGameMap({navigation, route}) {
  const {t} = useTranslation();
  const theme = useTheme();

  const [maping, setMaping] = React.useState(
    JSON.parse(JSON.stringify(defaultMaping)),
  );

  const [settings, setSettings] = React.useState<any>(null);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState(false);
  const flatListRef = React.useRef<FlatList>(null);

  const mapingRef = React.useRef(maping);

  React.useEffect(() => {
    log.info('Native Gamemap screen show');
    if (settings === null) {
      const _settings = getSettings();
      log.info('Get localSettings:', JSON.stringify(_settings));
      setSettings(_settings);
      if (_settings.native_gamepad_maping) {
        setMaping(_settings.native_gamepad_maping);
        mapingRef.current = _settings.native_gamepad_maping;
      }
    }
    if (route.params?.button && route.params?.keyCode !== undefined) {
      const button = route.params.button;
      const keyCode = route.params.keyCode;
      console.log('setMaping:', button, keyCode);
      console.log('mapingRef.current:', mapingRef.current);
      setMaping({
        ...mapingRef.current,
        [button]: keyCode,
      });
      mapingRef.current = {
        ...mapingRef.current,
        [button]: keyCode,
      };
    }
  }, [navigation, settings, route.params?.button, route.params?.keyCode]);

  const renderDatas: any = [];
  buttonLabels.forEach(button => {
    renderDatas.push({
      name: button,
      value: maping[button],
    });
  });

  const saveIndex = renderDatas.length;
  const resetIndex = renderDatas.length + 1;
  const backIndex = renderDatas.length + 2;

  React.useEffect(() => {
    if (focusedIndex < renderDatas.length) {
      try {
        flatListRef.current?.scrollToIndex({
          index: focusedIndex,
          viewPosition: 0.5,
          animated: true,
        });
      } catch {}
    }
  }, [focusedIndex, renderDatas.length]);

  const handleItemPress = item => {
    navigation.navigate('GameMapDetail', {
      button: item.name,
    });
  };

  const handleSave = () => {
    console.log('maping:', maping);
    settings.native_gamepad_maping = maping;
    setSettings(settings);
    saveSettings(settings);
    navigation.goBack();
  };

  const handleReset = () => {
    setMaping(JSON.parse(JSON.stringify(defaultMaping)));
    mapingRef.current = JSON.parse(JSON.stringify(defaultMaping));
  };

  useGamepadNavigation({
    priority: 10,
    onLeft: () => {
      setIsGamepadActive(true);
      if (focusedIndex === resetIndex) {
        setFocusedIndex(saveIndex);
      } else if (focusedIndex < renderDatas.length && focusedIndex % 2 === 1) {
        setFocusedIndex(prev => prev - 1);
      }
    },
    onRight: () => {
      setIsGamepadActive(true);
      if (focusedIndex === saveIndex) {
        setFocusedIndex(resetIndex);
      } else if (
        focusedIndex < renderDatas.length &&
        focusedIndex % 2 === 0 &&
        focusedIndex + 1 < renderDatas.length
      ) {
        setFocusedIndex(prev => prev + 1);
      }
    },
    onUp: () => {
      setIsGamepadActive(true);
      if (focusedIndex === backIndex) {
        setFocusedIndex(saveIndex);
      } else if (focusedIndex === saveIndex || focusedIndex === resetIndex) {
        setFocusedIndex(Math.max(0, renderDatas.length - 1));
      } else if (focusedIndex >= 2) {
        setFocusedIndex(prev => prev - 2);
      }
    },
    onDown: () => {
      setIsGamepadActive(true);
      if (focusedIndex + 2 < renderDatas.length) {
        setFocusedIndex(prev => prev + 2);
      } else if (focusedIndex < renderDatas.length) {
        setFocusedIndex(saveIndex);
      } else if (focusedIndex === saveIndex || focusedIndex === resetIndex) {
        setFocusedIndex(backIndex);
      }
    },
    onSelect: () => {
      setIsGamepadActive(true);
      if (focusedIndex < renderDatas.length) {
        handleItemPress(renderDatas[focusedIndex]);
      } else if (focusedIndex === saveIndex) {
        handleSave();
      } else if (focusedIndex === resetIndex) {
        handleReset();
      } else if (focusedIndex === backIndex) {
        navigation.goBack();
      }
    },
    onBack: () => {
      navigation.goBack();
    },
  });

  return (
    <View
      style={styles.container}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <FlatList
        ref={flatListRef}
        style={styles.scrollView}
        data={renderDatas}
        numColumns={2}
        onScrollToIndexFailed={() => {}}
        renderItem={({item, index}) => {
          const isFocused =
            (isGamepadActive || Platform.isTV) && focusedIndex === index;
          return (
            <View style={styles.listItem}>
              <MapItem
                mapItem={item}
                isFocused={isFocused}
                onPress={handleItemPress}
              />
            </View>
          );
        }}
      />

      <View style={styles.buttonWrap}>
        <View style={styles.buttonRow}>
          <Button
            mode={
              (isGamepadActive || Platform.isTV) && focusedIndex === saveIndex
                ? 'contained'
                : 'contained'
            }
            buttonColor={
              (isGamepadActive || Platform.isTV) && focusedIndex === saveIndex
                ? theme.colors.primary
                : undefined
            }
            textColor={
              (isGamepadActive || Platform.isTV) && focusedIndex === saveIndex
                ? '#FFFFFF'
                : undefined
            }
            style={[
              styles.buttonFlex,
              (isGamepadActive || Platform.isTV) &&
                focusedIndex === saveIndex &&
                styles.tvButtonFocused,
            ]}
            onPress={handleSave}>
            {t('Save Maping')}
          </Button>
          <Button
            mode={
              (isGamepadActive || Platform.isTV) && focusedIndex === resetIndex
                ? 'contained'
                : 'outlined'
            }
            buttonColor={
              (isGamepadActive || Platform.isTV) && focusedIndex === resetIndex
                ? theme.colors.primary
                : undefined
            }
            textColor={
              (isGamepadActive || Platform.isTV) && focusedIndex === resetIndex
                ? '#FFFFFF'
                : undefined
            }
            style={[
              styles.buttonFlex,
              (isGamepadActive || Platform.isTV) &&
                focusedIndex === resetIndex &&
                styles.tvButtonFocused,
            ]}
            onPress={handleReset}>
            {t('Reset')}
          </Button>
        </View>

        <Button
          mode={
            (isGamepadActive || Platform.isTV) && focusedIndex === backIndex
              ? 'contained'
              : 'text'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) && focusedIndex === backIndex
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) && focusedIndex === backIndex
              ? '#FFFFFF'
              : undefined
          }
          style={[
            styles.button,
            (isGamepadActive || Platform.isTV) &&
              focusedIndex === backIndex &&
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
  scrollView: {
    marginBottom: 170,
  },
  listItem: {
    width: '50%',
    justifyContent: 'center',
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 30,
    paddingLeft: 10,
    paddingRight: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonFlex: {
    flex: 1,
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
});

export default NativeGameMap;
