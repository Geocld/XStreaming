import React from 'react';
import {StyleSheet, View, Text, ScrollView, NativeModules} from 'react-native';
import {Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

const {FullScreenManager, GamepadManager} = NativeModules;

function DeviceInfosScreen({navigation, route}) {
  const {t} = useTranslation();
  const [infos, setInfos] = React.useState(null);
  const [rumbing, setRumbing] = React.useState(false);
  const rumblingRef = React.useRef(false);

  React.useEffect(() => {
    const _infos = FullScreenManager.getDeviceInfos();
    setInfos(_infos);

    return () => {
      GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
    };
  }, []);

  return (
    <ScrollView style={styles.wrap}>
      <View style={styles.btnWrap}>
        <View style={styles.btn}>
          <Button
            mode="contained"
            onPress={() => {
              GamepadManager.vibrate(60000, 100, 100, 100, 1000, 5);

              setTimeout(() => {
                GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
              }, 1000);
            }}>
            {t('Rumble1s')}
          </Button>
        </View>

        <View style={styles.btn}>
          <Button
            mode="contained"
            onPress={() => {
              if (rumblingRef.current) {
                GamepadManager.vibrate(0, 0, 0, 0, 0, 3);
                rumblingRef.current = false;
                setRumbing(false);
              } else {
                rumblingRef.current = true;
                setRumbing(true);
                GamepadManager.vibrate(60000, 100, 100, 100, 1000, 5);
              }
            }}>
            {rumbing ? t('Stop rumble') : t('ControllerRumble')}
          </Button>
        </View>

        <View style={styles.btn}>
          <Button
            mode="contained"
            onPress={() => {
              const _infos = FullScreenManager.getDeviceInfos();
              setInfos(_infos);
            }}>
            {t('Refresh')}
          </Button>
        </View>
      </View>

      {infos && (
        <View style={styles.infos}>
          <Text variant="labelMedium">
            {t('Model')}: {infos.factor + ' ' + infos.model}
          </Text>
          <Text variant="labelMedium">
            {t('Android Version')}: {infos.androidVer}
          </Text>
          <Text variant="labelMedium">
            {t('API Version')}: {infos.apiVer}
          </Text>
          <Text variant="labelMedium">
            {t('Kernel Version')}: {infos.kernelVer}
          </Text>
          <Text variant="labelMedium">
            {t('Webview Version')}: {infos.webviewVer}
          </Text>
          <Text variant="labelMedium">
            {t('Device rumble')}:{' '}
            {infos.devVibrator ? t('supported') : t('unsupported')}
          </Text>

          <Text variant="labelMedium">
            {t('Controllers')}: {infos.devs.length}
          </Text>

          {infos.devs.map((dev, idx) => {
            return (
              <View key={idx}>
                <Text variant="labelMedium">
                  {t('Name')}: {dev.name}
                </Text>
                <Text variant="labelMedium">
                  {t('Rumble')}:{' '}
                  {dev.rumble ? t('supported') : t('unsupported')}
                </Text>
                <Text variant="labelMedium">
                  {t('Sensor')}: {t(dev.sensor)}
                </Text>
                <Text variant="labelMedium">
                  {t('Details')}: {dev.details}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 10,
  },
  btnWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  btn: {
    flex: 1,
    minWidth: '50%',
    paddingLeft: 5,
    paddingRight: 5,
    marginTop: 10,
  },
  infos: {
    marginTop: 15,
  },
});

export default DeviceInfosScreen;
