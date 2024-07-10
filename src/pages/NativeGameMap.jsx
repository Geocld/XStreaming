import React from 'react';
import {View, StyleSheet, FlatList} from 'react-native';
import {
  Layout,
  Text,
  IndexPath,
  Select,
  SelectItem,
} from '@ui-kitten/components';
import {useIsFocused} from '@react-navigation/native';
import {getSettings, saveSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';
import MapItem from '../components/MapItem';

const log = debugFactory('NativeGameMapScreen');

const defaultMaping = {
  A: 96,
  B: 97,
  X: 99,
  Y: 100,
  DPadUp: 0,
  DPadDown: 3,
  DPadLeft: 1,
  DPadRight: 2,
  LeftShoulder: 102,
  RightShoulder: 103,
  LeftThumb: 106,
  RightThumb: 107,
  LeftTrigger: 104,
  RightTrigger: 105,
  Menu: 108,
  View: 109,
  Nexus: 110,
};

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
  const [maping, setMaping] = React.useState(
    JSON.parse(JSON.stringify(defaultMaping)),
  );
  const [current, setCurrent] = React.useState('');
  const [settings, setSettings] = React.useState({});

  const mapingRef = React.useRef(maping);

  const isFocused = useIsFocused();

  React.useEffect(() => {
    log.info('Native Gamemap screen show');
    if (route.params?.button && route.params?.keyCode) {
      const button = route.params.button;
      const keyCode = route.params.keyCode;
      setMaping({
        ...mapingRef.current,
        [button]: keyCode,
      });
    }

    const _settings = getSettings();
    log.info('Get localSettings:', _settings);
    setSettings(_settings);
  }, [navigation, route.params?.button, route.params?.keyCode]);

  const renderDatas = [];
  buttonLabels.forEach(button => {
    renderDatas.push({
      name: button,
      value: maping[button],
    });
  });

  const handleItemPress = item => {
    setCurrent(item.name);
    navigation.navigate('GameMapDetail', {
      button: item.name,
    });
  };

  const handleMapConfirm = keyCode => {
    setShowModal(false);
    setMaping({
      ...maping,
      [current]: keyCode,
    });
  };

  return (
    <View style={styles.container}>
      <FlatList
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listItem: {
    width: '50%',
    justifyContent: 'center',
  },
});

export default NativeGameMap;
