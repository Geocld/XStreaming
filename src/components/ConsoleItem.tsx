import React from 'react';
import {StyleSheet, View, useColorScheme} from 'react-native';
import {Card, Text, Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {SvgXml} from 'react-native-svg';
import icons from '../common/svg';
import {getSettings} from '../store/settingStore';

const ConsoleItem = (props: any) => {
  const {t} = useTranslation();
  const colorScheme = useColorScheme();
  const settings = getSettings();

  const consoleItem = props.consoleItem;

  let theme = settings.theme ?? 'dark';
  if (settings.theme === 'auto') {
    theme = colorScheme || 'dark';
  }

  return (
    <Card>
      <Card.Content>
        <Text variant="titleLarge" style={styles.top}>
          {consoleItem.name}
        </Text>
        <View style={styles.consoleInfos}>
          <View style={styles.infoLeft}>
            <SvgXml
              xml={theme === 'dark' ? icons.ConsoleDark : icons.ConsoleLight}
              width={60}
              height={60}
            />
          </View>
          <View style={styles.infoRight}>
            <Text variant="titleMedium">{consoleItem.consoleType}</Text>
            {consoleItem.powerState === 'On' ? (
              <Text style={styles.green}>{t('Powered on')}</Text>
            ) : consoleItem.powerState === 'ConnectedStandby' ? (
              <Text style={styles.yellow}>{t('Standby')}</Text>
            ) : (
              <Text>{consoleItem.powerState}</Text>
            )}
          </View>
        </View>
        <View style={styles.footer}>
          <Button
            mode="outlined"
            background={{
              borderless: false,
              color: 'rgba(255, 255, 255, 0.2)',
              foreground: true,
            }}
            onPress={props.onPress}>
            {t('Start stream')}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  xboxImg: {
    width: '100%',
    height: 50,
  },
  green: {
    color: '#36B728',
  },
  yellow: {
    color: '#D1BE02',
  },
  top: {
    paddingBottom: 10,
  },
  consoleInfos: {
    display: 'flex',
    flexDirection: 'row',
  },
  infoLeft: {
    width: 70,
  },
  infoRight: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  footer: {
    paddingTop: 10,
  },
  footerControl: {
    marginHorizontal: 2,
    backgroundColor: 'red',
  },
});

export default ConsoleItem;
