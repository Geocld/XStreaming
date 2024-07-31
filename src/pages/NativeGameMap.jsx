import React from 'react';
import {View, StyleSheet, FlatList} from 'react-native';
import {Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';
import MapItem from '../components/MapItem';
import {GAMEPAD_MAPING} from '../common';

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

  const [maping, setMaping] = React.useState(
    JSON.parse(JSON.stringify(defaultMaping)),
  );

  const [settings, setSettings] = React.useState(null);

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

  const renderDatas = [];
  buttonLabels.forEach(button => {
    renderDatas.push({
      name: button,
      value: maping[button],
    });
  });

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

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.scrollView}
        data={renderDatas}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        renderItem={({item}) => {
          return (
            <View style={styles.listItem}>
              <MapItem mapItem={item} onPress={handleItemPress} />
            </View>
          );
        }}
      />

      <View style={styles.buttonWrap}>
        <Button mode="contained" style={styles.button} onPress={handleSave}>
          {t('Save Maping')}
        </Button>
        <Button mode="outlined" style={styles.button} onPress={handleReset}>
          {t('Reset')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    marginBottom: 150,
  },
  listItem: {
    width: '50%',
    justifyContent: 'center',
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

export default NativeGameMap;
