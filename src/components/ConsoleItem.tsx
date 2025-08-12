import React from 'react';
import {StyleSheet, View, Image, Platform, Dimensions} from 'react-native';
import {Card, Text, Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {SvgXml} from 'react-native-svg';
import icons from '../common/svg';
import {getSettings} from '../store/settingStore';

const ConsoleItem = (props: any) => {
  const {t} = useTranslation();
  const settings = getSettings();

  const consoleItem = props.consoleItem;
  const {width} = Dimensions.get('window');

  const renderImage = () => {
    const type = consoleItem.consoleType;
    if (type === 'XboxSeriesX') {
      return (
        <Image
          source={require('../assets/console/series-x.png')}
          style={{width: '100%', height: width > 600 ? 150 : 130}}
        />
      );
    } else if (type === 'XboxSeriesS') {
      return (
        <Image
          source={require('../assets/console/series-s.png')}
          style={{width: '100%', height: width > 600 ? 150 : 130}}
        />
      );
    } else {
      return <SvgXml xml={icons.ConsoleIcon} width={'100%'} height={80} />;
    }
  };

  return (
    <Card>
      <Card.Content>
        <View style={styles.consoleInfos}>
          <Text variant="titleLarge" style={styles.textCenter}>
            {consoleItem.deviceName}
          </Text>
          {/* <Divider /> */}
          <View style={styles.image}>{renderImage()}</View>
          <View>
            <Text variant="titleMedium" style={styles.textCenter}>
              {consoleItem.consoleType}
            </Text>
            <Text
              variant="labelSmall"
              style={[styles.textCenter, {color: '#999'}]}>
              ({consoleItem.serverId})
            </Text>
            {consoleItem.powerState === 'On' ? (
              <Text style={[styles.green, styles.textCenter]}>
                {t('Powered on')}
              </Text>
            ) : consoleItem.powerState === 'ConnectedStandby' ? (
              <Text style={[styles.yellow, styles.textCenter]}>
                {t('Standby')}
              </Text>
            ) : (
              <Text style={[styles.red, styles.textCenter]}>
                {consoleItem.powerState}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.footer}>
          {settings.power_on &&
          consoleItem.powerState === 'ConnectedStandby' ? (
            <Button
              mode={Platform.isTV ? 'elevated' : 'outlined'}
              labelStyle={{marginHorizontal: 0}}
              onPress={props.onPoweronStream}>
              {t('Power on and start stream')}
            </Button>
          ) : (
            <Button
              mode={Platform.isTV ? 'elevated' : 'outlined'}
              labelStyle={{marginHorizontal: 0}}
              onPress={props.onPress}>
              {t('Start stream')}
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  green: {
    color: '#36B728',
  },
  yellow: {
    color: '#D1BE02',
  },
  red: {
    color: '#dc2626',
  },
  image: {},
  textCenter: {
    textAlign: 'center',
  },
  consoleInfos: {},
  footer: {
    paddingTop: 10,
  },
  footerControl: {
    marginHorizontal: 2,
    backgroundColor: 'red',
  },
});

export default ConsoleItem;
