import React from 'react';
import {StyleSheet, View, Image, Platform, Dimensions} from 'react-native';
import {
  Card,
  Text,
  Button,
  Menu,
  IconButton,
  useTheme,
} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import {SvgXml} from 'react-native-svg';
import icons from '../common/svg';
import {getSettings} from '../store/settingStore';

const ConsoleItem = (props: any) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const settings = getSettings();

  const [menuVisible, setMenuVisible] = React.useState(false);
  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const consoleItem = props.consoleItem;
  const {width} = Dimensions.get('window');
  const isWide = width > 600;

  const renderImage = () => {
    const type = consoleItem.consoleType;
    if (type === 'XboxSeriesX') {
      return (
        <Image
          source={require('../assets/console/series-x.png')}
          style={[styles.consoleImage, isWide && styles.consoleImageWide]}
          resizeMode="contain"
        />
      );
    } else if (type === 'XboxSeriesS') {
      return (
        <Image
          source={require('../assets/console/series-s.png')}
          style={[styles.consoleImage, isWide && styles.consoleImageWide]}
          resizeMode="contain"
        />
      );
    } else {
      return <SvgXml xml={icons.ConsoleIcon} width={'100%'} height={80} />;
    }
  };

  return (
    <Card mode="contained" style={[styles.card, theme.dark && styles.cardDark]}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.menuContainer}>
          <Menu
            visible={menuVisible}
            onDismiss={closeMenu}
            anchor={
              <IconButton icon="dots-vertical" size={24} onPress={openMenu} />
            }>
            <Menu.Item
              onPress={() => {
                closeMenu();
                props.onPoweron && props.onPoweron();
              }}
              title={t('Powered on')}
            />
            <Menu.Item
              onPress={() => {
                closeMenu();
                props.onPoweroff && props.onPoweroff();
              }}
              title={t('Powered off')}
            />
          </Menu>
        </View>

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
              style={[
                styles.textCenter,
                styles.serverId,
                theme.dark && styles.serverIdDark,
              ]}>
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
              style={[
                styles.actionButton,
                theme.dark && styles.actionButtonDark,
              ]}
              labelStyle={styles.actionButtonLabel}
              onPress={props.onPoweronStream}>
              {t('Power on and start stream')}
            </Button>
          ) : (
            <Button
              mode={Platform.isTV ? 'elevated' : 'outlined'}
              style={[
                styles.actionButton,
                theme.dark && styles.actionButtonDark,
              ]}
              labelStyle={styles.actionButtonLabel}
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
  card: {
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.56)',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  cardDark: {
    backgroundColor: 'rgba(18, 20, 32, 0.84)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowOpacity: 0.32,
  },
  cardContent: {
    padding: 16,
  },
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
  consoleImage: {
    width: '100%',
    height: 130,
  },
  consoleImageWide: {
    height: 150,
  },
  textCenter: {
    textAlign: 'center',
  },
  serverId: {
    color: 'rgba(120, 120, 136, 0.88)',
  },
  serverIdDark: {
    color: 'rgba(214, 216, 232, 0.62)',
  },
  consoleInfos: {},
  footer: {
    paddingTop: 10,
  },
  actionButton: {
    borderColor: 'rgba(16, 124, 16, 0.42)',
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  actionButtonDark: {
    borderColor: 'rgba(110, 235, 131, 0.28)',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  actionButtonLabel: {
    marginHorizontal: 0,
    fontWeight: '700',
  },
  footerControl: {
    marginHorizontal: 2,
    backgroundColor: 'red',
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
  },
});

export default ConsoleItem;
