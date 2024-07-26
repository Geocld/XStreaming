import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from '@ui-kitten/components';
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
          <Text style={styles.text}>FPS: {performance.fps || '-1'} | </Text>
        </View>
        <View>
          <Text style={styles.text}>FD: {performance.fl || '-1'} | </Text>
        </View>
        <View>
          <Text style={styles.text}>PL: {performance.pl || '-1'} | </Text>
        </View>
        <View>
          <Text style={styles.text}>Bitrate: {performance.br || '-1'} | </Text>
        </View>
        <View>
          <Text style={styles.text}>DT: {performance.decode || '-1'}</Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    padding: 2,
    flexDirection: 'row',
  },
  text: {
    fontSize: 12,
  },
});

export default PerfPanel;
