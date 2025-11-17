import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  NativeModules,
  ToastAndroid,
} from 'react-native';
import {Button, RadioButton, Text, Divider} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import RNRestart from 'react-native-restart';
import Slider from '@react-native-community/slider';
import {useSelector} from 'react-redux';
import {getSettings, saveSettings} from '../store/settingStore';
import {clearStreamToken} from '../store/streamTokenStore';
import {clearWebToken} from '../store/webTokenStore';
import {clearXcloudData} from '../store/xcloudStore';
import {clearConsolesData} from '../store/consolesStore';

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

const {UsbRumbleManager} = NativeModules;

function SettingDetailScreen({navigation, route}) {
  const {t} = useTranslation();

  const [current, setCurrent] = React.useState('');
  const [value, setValue] = React.useState('');
  const [value2, setValue2] = React.useState('');
  const [currentMetas, setCurrentMetas] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const regions = React.useRef([]);
  const xgpuRegions = React.useRef([]);

  const streamingTokens = useSelector(state => state.streamingTokens);
  regions.current = streamingTokens.xHomeToken?.getRegions() || [];

  if (streamingTokens.xCloudToken) {
    xgpuRegions.current = streamingTokens.xCloudToken?.getRegions() || [];
  }

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
      let metas = {};
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
        const rsName = name === 'signaling_home' ? 'signaling_home_name' : 'signaling_cloud_name';
        const rsValue = _settings[rsName]

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
    if (currentMetas.name === 'signaling_home' || currentMetas.name === 'signaling_cloud') {
      settings[currentMetas.name === 'signaling_home' ? 'signaling_home_name' : 'signaling_cloud_name'] = value;
    } else if (settings[current] !== undefined) {
      settings[current] = value;
    }

    setSettings(settings);
    saveSettings(settings);
  };

  const handleSave = () => {
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
    } else if (current === 'preferred_game_language') {
      clearXcloudData();
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
      console.log('value:', value)
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
  };

  const restart = () => {
    setTimeout(() => {
      RNRestart.restart();
    }, 500);
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
      return (
        <>
          <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
            {currentMetas &&
              currentMetas.data.map((item, idx) => {
                return (
                  <RadioButton.Item
                    key={idx}
                    label={item.text}
                    value={item.value}
                  />
                );
              })}
          </RadioButton.Group>
          {value === 'custom' && (
            <>
              <Text style={styles.sliderTitle}>
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
                minimumTrackTintColor="#107C10"
                maximumTrackTintColor="grey"
              />
            </>
          )}
        </>
      );
    }
    if (
      currentMetas.name === 'signaling_home' ||
      currentMetas.name === 'signaling_cloud'
    ) {
      const servers =
        currentMetas.name === 'signaling_home'
          ? regions.current
          : xgpuRegions.current;
      return (
        <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
          {servers &&
            servers.map((item, idx) => {
              return (
                <RadioButton.Item
                  key={idx}
                  label={item.name}
                  value={item.name}
                />
              );
            })}
        </RadioButton.Group>
      );
    }
    if (currentMetas.type === 'radio') {
      return (
        <RadioButton.Group onValueChange={val => setValue(val)} value={value}>
          {currentMetas &&
            currentMetas.data.map((item, idx) => {
              return (
                <RadioButton.Item
                  key={idx}
                  label={item.text}
                  value={item.value}
                />
              );
            })}
        </RadioButton.Group>
      );
    } else if (currentMetas.type === 'slider') {
      return (
        <>
          <Text style={styles.sliderTitle}>
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
            lowerLimit={0.1}
            minimumTrackTintColor="#107C10"
            maximumTrackTintColor="grey"
          />
        </>
      );
    } else {
      return null;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.tips}>
          <Text>{currentMetas && currentMetas.description}</Text>
        </View>

        {currentMetas && currentMetas.tips && (
          <View style={styles.tips}>
            <Text>Tips: {currentMetas && currentMetas.tips}</Text>
          </View>
        )}

        <Divider />

        {renderOptions()}
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
    flex: 1,
  },
  tips: {
    padding: 10,
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

export default SettingDetailScreen;
