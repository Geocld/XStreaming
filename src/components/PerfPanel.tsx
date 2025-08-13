import React from 'react';
import {StyleSheet, View, NativeModules} from 'react-native';
import {Text} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {getSettings} from '../store/settingStore';

const {BatteryModule} = NativeModules;

type Props = {
  performance: any;
};

const PerfPanel: React.FC<Props> = ({performance = {}}) => {
  const {t} = useTranslation();
  const settings = getSettings();
  const [battery, setBattery] = React.useState(100);
  const batteryInterval = React.useRef<any>(null);

  const isHorizon = settings.performance_style;

  React.useEffect(() => {
    const getBattery = () => {
      BatteryModule.getBatteryLevel()
        .then((level: any) => {
          if (level) {
            setBattery(Number(level));
          } else {
            setBattery(-1);
          }
        })
        .catch((e: any) => {
          console.log(e);
        });
    };
    getBattery();

    // Catch battery every 2 mins
    batteryInterval.current = setInterval(getBattery, 2 * 60 * 1000);

    return () => {
      batteryInterval.current && clearInterval(batteryInterval.current);
    };
  }, []);

  const renderBattery = (level: number) => {
    if (level < 20) {
      return `🪫: ${level}%`;
    } else {
      return `🔋: ${level}%`;
    }
  };

  let resolutionText = '';
  if (performance.resolution) {
    resolutionText = performance.resolution;
    if (settings.resolution === 1081) {
      resolutionText = resolutionText + '(HQ)';
    }
  }

  return (
    <View style={isHorizon ? styles.containerH : styles.containerV}>
      <View style={isHorizon ? styles.wrapperH : styles.wrapperV}>
        <View>
          <Text style={styles.text}>
            {resolutionText || '-1'} {isHorizon ? '| ' : ''}{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('RTT')}: {performance.rtt || '-1'} {isHorizon ? '| ' : ''}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('FPS')}: {performance.fps || '-1'} {isHorizon ? '| ' : ''}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('FD')}: {performance.fl || '-1'} {isHorizon ? '| ' : ''}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('PL')}: {performance.pl || '-1'} {isHorizon ? '| ' : ''}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('Bitrate')}: {performance.br || '-1'} {isHorizon ? '| ' : ''}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('DT')}: {performance.decode || '-1'}
            {isHorizon ? ' | ' : ''}
          </Text>
        </View>
        {battery > -1 && (
          <View>
            <Text style={styles.text}>{renderBattery(battery)}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  containerH: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    zIndex: 5,
  },
  wrapperH: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 2,
    flexDirection: 'row',
  },
  containerV: {
    flex: 1,
    justifyContent: 'flex-start',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 5,
    padding: 5,
  },
  wrapperV: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 2,
  },
  text: {
    fontSize: 12,
    color: '#fff',
  },
});

export default PerfPanel;
