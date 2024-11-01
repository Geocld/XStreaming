import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

type Props = {
  performance: any;
};

const PerfPanel: React.FC<Props> = ({performance = {}}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.wrapper}>
        <View>
          <Text style={styles.text}>{performance.resolution || '-1'} | </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('RTT')}: {performance.rtt || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('FPS')}: {performance.fps || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('FD')}: {performance.fl || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('PL')}: {performance.pl || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('Bitrate')}: {performance.br || '-1'} |{' '}
          </Text>
        </View>
        <View>
          <Text style={styles.text}>
            {t('DT')}: {performance.decode || '-1'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    zIndex: 5,
  },
  wrapper: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 2,
    flexDirection: 'row',
  },
  text: {
    fontSize: 12,
    color: '#fff',
  },
});

export default PerfPanel;
