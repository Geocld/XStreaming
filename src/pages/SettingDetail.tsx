import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  NativeModules,
  ToastAndroid,
  Platform,
} from 'react-native';
import {
  Button,
  RadioButton,
  Text,
  Divider,
  Card,
  useTheme,
} from 'react-native-paper';
import CookieManager from '@react-native-cookies/cookies';
import {useTranslation} from 'react-i18next';
import RNRestart from 'react-native-restart';
import Slider from '@react-native-community/slider';
import {useSelector} from 'react-redux';
import {getSettings, saveSettings} from '../store/settingStore';
import {clearStreamToken} from '../store/streamTokenStore';
import {clearWebToken} from '../store/webTokenStore';
import {clearXcloudData} from '../store/xcloudStore';
import {clearConsolesData} from '../store/consolesStore';
import {useGamepadNavigation, useGamepadActiveState} from '../utils/useGamepadNavigation';
import GamepadFooterHints from '../components/GamepadFooterHints';

import bases from '../common/settings/bases';
import display from '../common/settings/display';
import gamepad from '../common/settings/gamepad';
import vgamepad from '../common/settings/vgamepad';
import audio from '../common/settings/audio';
import xcloud from '../common/settings/xcloud';
import xhome from '../common/settings/xhome';
import sensor from '../common/settings/sensor';
import server from '../common/settings/server';
import others from '../common/settings/others';
import {
  DEFAULT_THEME_PRIMARY_COLOR,
  normalizeHexColor,
  shiftColor,
} from '../utils/themeColor';
import {
  getRegionIpForCloudName,
  getCloudNameForRegionIp,
} from '../utils/regionSync';

const {UsbRumbleManager} = NativeModules;

function SettingDetailScreen({navigation, route}) {
  const {t} = useTranslation();
  const theme = useTheme();

  const [current, setCurrent] = React.useState<any>('');
  const [value, setValue] = React.useState<any>('');
  const [value2, setValue2] = React.useState<any>('');
  const [currentMetas, setCurrentMetas] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const regions = React.useRef<any>([]);
  const xgpuRegions = React.useRef<any>([]);

  const authentication = useSelector((state: any) => state.authentication);
  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  regions.current = streamingTokens.xHomeToken?.getRegions() || [];

  if (streamingTokens.xCloudToken) {
    xgpuRegions.current = streamingTokens.xCloudToken?.getRegions() || [];
  }

  const primaryColor = normalizeHexColor(
    settings.theme_primary_color,
    DEFAULT_THEME_PRIMARY_COLOR,
  );
  const heroCardStyle = React.useMemo(
    () => [
      styles.heroCard,
      {backgroundColor: theme.colors.primaryContainer},
    ],
    [theme.colors.primaryContainer],
  );
  const heroDescStyle = React.useMemo(
    () => [styles.heroDesc, {color: theme.colors.onPrimaryContainer}],
    [theme.colors.onPrimaryContainer],
  );
  const heroHintStyle = React.useMemo(
    () => [
      styles.heroHint,
      {color: theme.colors.onPrimaryContainer, opacity: 0.8},
    ],
    [theme.colors.onPrimaryContainer],
  );

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    if (route.params?.id) {
      const name = route.params.id;
      let currentVal = _settings[name];
      const settingsMeta = [
        ...bases,
        ...display,
        ...gamepad,
        ...vgamepad,
        ...audio,
        ...xcloud,
        ...xhome,
        ...sensor,
        ...server,
        ...others,
      ];
      let metas: any = {};
      settingsMeta.forEach(item => {
        if (item.name === name) {
          metas = item;
        }
      });

      if (name === 'xhome_bitrate_mode') {
        setValue2(_settings.xhome_bitrate);
      }
      if (name === 'xcloud_bitrate_mode') {
        setValue2(_settings.xcloud_bitrate);
      }
      if (name === 'audio_bitrate_mode') {
        setValue2(_settings.audio_bitrate);
      }

      if (name === 'signaling_home' || name === 'signaling_cloud') {
        const rs =
          name === 'signaling_home' ? regions.current : xgpuRegions.current;
        const rsName =
          name === 'signaling_home'
            ? 'signaling_home_name'
            : 'signaling_cloud_name';
        const rsValue = _settings[rsName];

        let _currentVal = '';

        rs.forEach(region => {
          if (region.name === rsValue) {
            _currentVal = region.name;
          }
        });

        if (!_currentVal) {
          rs.forEach(region => {
            if (region.isDefault) {
              _currentVal = region.name;
            }
          });
        }

        currentVal = _currentVal;
      }

      setValue(currentVal);
      setCurrent(name);
      setCurrentMetas(metas);
      navigation.setOptions({
        title: metas.title || '',
      });
    }
  }, [navigation, route.params?.id]);

  const handleSaveSettings = () => {
    let settingValue: any = value;
    if (settingValue === 'true') settingValue = true;
    if (settingValue === 'false') settingValue = false;
    if (currentMetas?.name === 'theme_primary_color') {
      settingValue = normalizeHexColor(value, DEFAULT_THEME_PRIMARY_COLOR);
      setValue(settingValue);
    }

    if (currentMetas.name === 'locale') {
      settings.locale = settingValue;
      settings.locale_follow_system = false;
    } else if (
      currentMetas.name === 'signaling_home' ||
      currentMetas.name === 'signaling_cloud'
    ) {
      settings[
        currentMetas.name === 'signaling_home'
          ? 'signaling_home_name'
          : 'signaling_cloud_name'
      ] = settingValue;
      if (currentMetas.name === 'signaling_cloud') {
        const matchingIp = getRegionIpForCloudName(settingValue);
        if (matchingIp) {
          settings.force_region_ip = matchingIp;
        }
      }
    } else if (settings[current] !== undefined) {
      settings[current] = settingValue;
      if (current === 'force_region_ip') {
        const matchingCloud = getCloudNameForRegionIp(settingValue);
        if (matchingCloud) {
          settings.signaling_cloud_name = matchingCloud;
        }
      }
    }

    setSettings(settings);
    saveSettings(settings);
  };

  const handleSave = () => {
    let shouldRestart = false;
    if (current === 'locale') {
      handleSaveSettings();
      restart();
    } else if (current === 'force_region_ip') {
      clearStreamToken();
      clearWebToken();
      clearXcloudData();
      clearConsolesData();
      handleSaveSettings();
      setTimeout(() => {
        restart();
      }, 500);
    } else if (current === 'use_msal_login') {
      clearStreamToken();
      clearWebToken();
      clearXcloudData();
      clearConsolesData();
      authentication._tokenStore.clear();
      CookieManager.clearAll();
      setTimeout(() => {
        restart();
      }, 500);
    } else if (current === 'preferred_game_language') {
      clearXcloudData();
    } else if (
      current === 'enable_stereo_audio' ||
      current === 'native_low_latency_decoder'
    ) {
      shouldRestart = true;
    } else if (current === 'xhome_bitrate_mode') {
      settings.xhome_bitrate_mode = value;
      settings.xhome_bitrate = value2;
    } else if (current === 'xcloud_bitrate_mode') {
      settings.xcloud_bitrate_mode = value;
      settings.xcloud_bitrate = value2;
    } else if (current === 'audio_bitrate_mode') {
      settings.audio_bitrate_mode = value;
      settings.audio_bitrate = value2;
    } else if (currentMetas.name === 'signaling_home') {
      regions.current.forEach(region => {
        if (region.name === value) {
          region.isDefault = true;
        } else {
          region.isDefault = false;
        }
      });
      settings.signaling_home_name = value;
    } else if (currentMetas.name === 'signaling_cloud') {
      xgpuRegions.current.forEach(region => {
        if (region.name === value) {
          region.isDefault = true;
        } else {
          region.isDefault = false;
        }
      });
      console.log('value:', value);
      settings.signaling_cloud_name = value;
    } else if (currentMetas.name === 'bind_usb_device') {
      UsbRumbleManager.setBindUsbDevice(value);
    } else if (currentMetas.name === 'gamepad_kernal') {
      settings.gamepad_maping = null;
      settings.native_gamepad_maping = null;
    }
    handleSaveSettings();
    ToastAndroid.show(t('Saved'), ToastAndroid.SHORT);
    navigation.goBack();
    if (shouldRestart) {
      setTimeout(() => {
        restart();
      }, 500);
    }
  };

  const restart = () => {
    setTimeout(() => {
      RNRestart.restart();
    }, 500);
  };

  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState();
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const isSliderType = currentMetas?.type === 'slider';
  const hasCustomBitrateSlider =
    (currentMetas?.name === 'xhome_bitrate_mode' ||
      currentMetas?.name === 'xcloud_bitrate_mode' ||
      currentMetas?.name === 'audio_bitrate_mode') &&
    value === 'custom';

  const optionsList = React.useMemo(() => {
    if (!currentMetas) return [];
    if (
      currentMetas.name === 'xhome_bitrate_mode' ||
      currentMetas.name === 'xcloud_bitrate_mode' ||
      currentMetas.name === 'audio_bitrate_mode'
    ) {
      return (currentMetas.data || []).map((item: any) => ({
        label: item.text,
        value: item.value,
      }));
    }
    if (
      currentMetas.name === 'signaling_home' ||
      currentMetas.name === 'signaling_cloud'
    ) {
      const rs =
        currentMetas.name === 'signaling_home'
          ? regions.current
          : xgpuRegions.current;
      return (rs || []).map((item: any) => ({
        label: item.name,
        value: item.name,
      }));
    }
    if (currentMetas.type === 'radio') {
      return (currentMetas.data || []).map((item: any) => ({
        label: item.text,
        value: item.value,
      }));
    }
    if (currentMetas.type === 'color') {
      const colorOptions = Array.isArray(currentMetas.data)
        ? currentMetas.data
        : [];
      return colorOptions.map((item: any) => {
        const colorValue = normalizeHexColor(
          typeof item === 'string' ? item : item.value,
          DEFAULT_THEME_PRIMARY_COLOR,
        );
        return {
          label: typeof item === 'string' ? colorValue : item.text,
          value: colorValue,
        };
      });
    }
    return [];
  }, [currentMetas]);

  const numOptions = optionsList.length;
  const customSliderIndex = hasCustomBitrateSlider ? numOptions : -1;
  const saveButtonIndex = isSliderType
    ? 1
    : hasCustomBitrateSlider
    ? numOptions + 1
    : numOptions;
  const backButtonIndex = saveButtonIndex + 1;
  const totalTargets = backButtonIndex + 1;

  useGamepadNavigation({
    onUp: () => {
      setFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      setFocusedIndex(prev => Math.min(totalTargets - 1, prev + 1));
    },
    onLeft: () => {
      if (isSliderType && focusedIndex === 0) {
        const step = currentMetas?.step || 1;
        const min = currentMetas?.min ?? 0;
        setValue((prev: number) =>
          parseFloat(Math.max(min, Number(prev) - step).toFixed(2)),
        );
      } else if (hasCustomBitrateSlider && focusedIndex === customSliderIndex) {
        setValue2((prev: number) => Math.max(1, Number(prev) - 1));
      } else if (focusedIndex === backButtonIndex) {
        setFocusedIndex(saveButtonIndex);
      }
    },
    onRight: () => {
      if (isSliderType && focusedIndex === 0) {
        const step = currentMetas?.step || 1;
        const max = currentMetas?.max ?? 100;
        setValue((prev: number) =>
          parseFloat(Math.min(max, Number(prev) + step).toFixed(2)),
        );
      } else if (hasCustomBitrateSlider && focusedIndex === customSliderIndex) {
        setValue2((prev: number) => Math.min(50, Number(prev) + 1));
      } else if (focusedIndex === saveButtonIndex) {
        setFocusedIndex(backButtonIndex);
      }
    },
    onSelect: () => {
      if (focusedIndex === saveButtonIndex) {
        handleSave();
      } else if (focusedIndex === backButtonIndex) {
        navigation.goBack();
      } else if (!isSliderType && focusedIndex < numOptions) {
        const opt = optionsList[focusedIndex];
        if (opt) {
          setValue(opt.value);
        }
      }
    },
    onBack: () => {
      navigation.goBack();
    },
  });

  React.useEffect(() => {
    if (isGamepadActive || Platform.isTV) {
      const targetY = Math.max(0, focusedIndex * 52 - 100);
      scrollViewRef.current?.scrollTo({y: targetY, animated: true});
    }
  }, [focusedIndex, isGamepadActive]);

  const renderRadioItem = (
    item: {label: string; value: any; color?: string; uncheckedColor?: string},
    idx: number,
  ) => {
    const isOptionFocused =
      (isGamepadActive || Platform.isTV) && focusedIndex === idx;
    return (
      <View
        key={idx}
        style={[
          styles.optionItemWrap,
          isOptionFocused && styles.optionItemFocused,
        ]}>
        <RadioButton.Item
          label={item.label}
          value={item.value}
          color={item.color}
          uncheckedColor={item.uncheckedColor}
          labelStyle={
            isOptionFocused
              ? {color: theme.colors.primary, fontWeight: '700'}
              : undefined
          }
          onPress={() => setValue(item.value)}
        />
      </View>
    );
  };

  const renderOptions = () => {
    if (!currentMetas) {
      return null;
    }
    if (
      currentMetas.name === 'xhome_bitrate_mode' ||
      currentMetas.name === 'xcloud_bitrate_mode' ||
      currentMetas.name === 'audio_bitrate_mode'
    ) {
      const isCustomSliderFocused =
        (isGamepadActive || Platform.isTV) &&
        focusedIndex === customSliderIndex;
      return (
        <>
          <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
            {optionsList.map((item, idx) => renderRadioItem(item, idx))}
          </RadioButton.Group>
          {value === 'custom' && (
            <View
              style={[
                styles.sliderBox,
                isCustomSliderFocused && styles.sliderBoxFocused,
              ]}>
              <Text
                style={[
                  styles.sliderTitle,
                  isCustomSliderFocused && {
                    color: theme.colors.primary,
                    fontWeight: '700',
                  },
                ]}>
                {t('Current')}: {value2} Mbps
              </Text>
              <Slider
                style={styles.slider}
                value={value2}
                minimumValue={1}
                maximumValue={50}
                step={1}
                lowerLimit={1}
                onValueChange={val => {
                  setValue2(val);
                }}
                minimumTrackTintColor={primaryColor}
                maximumTrackTintColor="grey"
              />
            </View>
          )}
        </>
      );
    }
    if (
      currentMetas.name === 'signaling_home' ||
      currentMetas.name === 'signaling_cloud'
    ) {
      return (
        <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
          {optionsList.map((item, idx) => renderRadioItem(item, idx))}
        </RadioButton.Group>
      );
    }
    if (currentMetas.type === 'radio') {
      return (
        <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
          {optionsList.map((item, idx) => renderRadioItem(item, idx))}
        </RadioButton.Group>
      );
    } else if (currentMetas.type === 'color') {
      const selectedColor = normalizeHexColor(
        value,
        DEFAULT_THEME_PRIMARY_COLOR,
      );

      return (
        <View style={styles.colorWrap}>
          <Text style={styles.sliderTitle}>
            {t('Current')}: {selectedColor}
          </Text>
          <View style={styles.currentColorRow}>
            <View
              style={[
                styles.currentColorPreview,
                {
                  backgroundColor: selectedColor,
                },
              ]}
            />
          </View>
          <RadioButton.Group
            onValueChange={val =>
              setValue(normalizeHexColor(val, DEFAULT_THEME_PRIMARY_COLOR))
            }
            value={selectedColor}>
            {optionsList.map((item, idx) =>
              renderRadioItem(
                {
                  label: item.label,
                  value: item.value,
                  color: item.value,
                  uncheckedColor: item.value,
                },
                idx,
              ),
            )}
          </RadioButton.Group>
        </View>
      );
    } else if (currentMetas.type === 'slider') {
      const isNormalSliderFocused =
        (isGamepadActive || Platform.isTV) && focusedIndex === 0;
      return (
        <View
          style={[
            styles.sliderBox,
            isNormalSliderFocused && styles.sliderBoxFocused,
          ]}>
          <Text
            style={[
              styles.sliderTitle,
              isNormalSliderFocused && {
                color: theme.colors.primary,
                fontWeight: '700',
              },
            ]}>
            {t('Current')}: {value}
          </Text>
          <Slider
            style={styles.slider}
            value={value}
            minimumValue={currentMetas.min}
            maximumValue={currentMetas.max}
            step={currentMetas.step}
            onValueChange={val => {
              setValue(parseFloat(val.toFixed(2)));
            }}
            lowerLimit={currentMetas.min}
            minimumTrackTintColor={primaryColor}
            maximumTrackTintColor="grey"
          />
        </View>
      );
    } else {
      return null;
    }
  };

  return (
    <View
      style={styles.container}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={
          isGamepadActive || Platform.isTV ? {paddingBottom: 64} : undefined
        }>
        <Card style={heroCardStyle}>
          <Card.Content>
            <Text style={heroDescStyle}>{currentMetas?.description || ''}</Text>
            {!!currentMetas?.tips && (
              <Text style={heroHintStyle}>{currentMetas.tips}</Text>
            )}
          </Card.Content>
        </Card>

        <Divider />

        {renderOptions()}
      </ScrollView>

      <View style={styles.buttonWrap}>
        <Button
          mode={
            (isGamepadActive || Platform.isTV) &&
            focusedIndex === saveButtonIndex
              ? 'contained'
              : 'elevated'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) &&
            focusedIndex === saveButtonIndex
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) &&
            focusedIndex === saveButtonIndex
              ? '#FFFFFF'
              : undefined
          }
          style={[
            styles.button,
            (isGamepadActive || Platform.isTV) &&
              focusedIndex === saveButtonIndex &&
              styles.tvButtonFocused,
          ]}
          onPress={handleSave}>
          {t('Save')}
        </Button>
        <Button
          mode={
            (isGamepadActive || Platform.isTV) &&
            focusedIndex === backButtonIndex
              ? 'contained'
              : 'text'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) &&
            focusedIndex === backButtonIndex
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) &&
            focusedIndex === backButtonIndex
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
    marginBottom: 120,
  },
  sliderTitle: {
    padding: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  colorWrap: {
    paddingHorizontal: 10,
    paddingBottom: 16,
  },
  currentColorRow: {
    marginBottom: 14,
  },
  currentColorPreview: {
    width: 64,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
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
  optionItemWrap: {
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
  },
  optionItemFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 4,
  },
  sliderBox: {
    marginHorizontal: 8,
    padding: 8,
    borderRadius: 8,
  },
  sliderBoxFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 4,
  },
  tvButtonFocused: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.03}],
    elevation: 8,
  },
});

export default SettingDetailScreen;
