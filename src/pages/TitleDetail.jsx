import React from 'react';
import {StyleSheet, View, ScrollView, Image, NativeModules} from 'react-native';
import {
  Text,
  Button,
  Portal,
  Modal,
  Card,
  HelperText,
} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {useSelector} from 'react-redux';
import {getSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import XcloudApi from '../xCloud';
import games from '../mock/games.json';

const {UsbRumbleManager, FullScreenManager} = NativeModules;

const log = debugFactory('TitleDetailScreen');

const warnTitles = ['MINECRAFTDUNGEONS', 'MICROSOFTFLIGHTSIMULATOR'];
const webviewTitles = ['FORTNITE'];

function TitleDetail({navigation, route}) {
  const {t} = useTranslation();
  const [titleItem, setTitleItem] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const streamingTokens = useSelector(state => state.streamingTokens);
  const [showUsbWarnModal, setShowUsbWarnShowModal] = React.useState(false);

  React.useEffect(() => {
    log.info('TitleDetail titleItem:', route.params?.titleItem);
    if (route.params?.titleItem) {
      setTitleItem(route.params.titleItem);
    }
    const _settings = getSettings();
    setSettings(_settings);
    navigation.setOptions({
      title: route.params?.titleItem.ProductTitle || '',
    });
  }, [route.params?.titleItem, navigation]);

  const handleStartGame = async () => {
    const titleId = titleItem.titleId || titleItem.XCloudTitleId;
    log.info('HandleStartCloudGame titleId:', titleId);
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    if (isUsbMode) {
      setShowUsbWarnShowModal(true);
    } else {
      handleNavigateStream();
    }
  };

  const handleNavigateStream = async () => {
    const titleId = titleItem.titleId || titleItem.XCloudTitleId;
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const usbController = await UsbRumbleManager.getUsbController();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    const webviewVersion = FullScreenManager.getWebViewVersion();
    const deviceInfos = FullScreenManager.getDeviceInfos();
    let isLagecy = false;
    if (webviewVersion) {
      const verArr = webviewVersion.split('.');
      const mainVer = verArr[0];

      // webview version is below 91
      if (deviceInfos.androidVer < 12 && mainVer < 91) {
        isLagecy = true;
      }
    }

    let routeName = 'Stream';
    if (settings.render_engine === 'native') {
      routeName = 'NativeStream';
    }

    // Lagecy user force to native stream
    if (isLagecy) {
      routeName = 'NativeStream';
    }

    // Below titles use webview stream
    if (warnTitles.indexOf(titleId) > -1 || webviewTitles.indexOf(titleId) > -1) {
      routeName = 'Stream';
    }

    return

    navigation.navigate({
      name: routeName,
      params: {
        sessionId: titleId,
        settings,
        streamType: 'cloud',
        isUsbMode,
        usbController,
      },
    });
  };

  // Warn: xboxOne controller must press Nexus button first to active button
  const renderUsbWarningModal = () => {
    if (!showUsbWarnModal) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={showUsbWarnModal}
          onDismiss={() => {
            setShowUsbWarnShowModal(false);
          }}
          contentContainerStyle={{marginLeft: '4%', marginRight: '4%'}}>
          <Card>
            <Card.Content>
              <Text>
                TIPS1:{' '}
                {t(
                  'It has been detected that you are using the wired connection mode with the Overwrite Android driver. If the USB connection is disconnected during the game, please exit the game and reconnect the controller; otherwise, the controller buttons will become unresponsive',
                )}
              </Text>
              <Text>
                TIPS2:{' '}
                {t(
                  'If you are using an Xbox One/S/X controller and encounter unresponsive buttons when entering the game, please press the home button on the controller first',
                )}
              </Text>

              <Button
                onPress={() => {
                  setShowUsbWarnShowModal(false);
                  handleNavigateStream();
                }}>
                {t('Confirm')}
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  let isByorg = false;
  if (
    titleItem &&
    !titleItem.XCloudTitleId &&
    titleItem.details &&
    titleItem.details.programs
  ) {
    if (titleItem.details.programs.indexOf('BYOG') > -1) {
      isByorg = true;
    }
  }

  let description = '';
  if (
    titleItem &&
    games[titleItem.XboxTitleId] &&
    games[titleItem.XboxTitleId].short_description
  ) {
    description = games[titleItem.XboxTitleId].short_description;
  }

  return (
    <View style={styles.container}>
      <Spinner loading={!titleItem} text={t('Loading...')} />

      {renderUsbWarningModal()}

      {titleItem && (
        <>
          <ScrollView style={styles.scrollView}>
            {titleItem.Image_Poster && (
              <Image
                source={{
                  uri: 'https:' + titleItem.Image_Poster.URL,
                }}
                resizeMode="center"
                style={styles.image}
              />
            )}
            <View style={styles.textWrap}>
              <Text variant="titleLarge" style={styles.productTitle}>
                {titleItem.ProductTitle}
              </Text>
              <Text variant="titleMedium">{titleItem.PublisherName}</Text>
            </View>

            {isByorg && (
              <View style={styles.tagsWrap}>
                <HelperText type="error" visible={true}>
                  {t('byorg')}
                </HelperText>
              </View>
            )}

            {warnTitles.indexOf(titleItem.titleId) > -1 ? (
              <View style={styles.tagsWrap}>
                <HelperText type="error" visible={true}>
                  {t('compatibleWarn')}
                </HelperText>
              </View>
            ) : null}

            <View style={styles.tagsWrap}>
              {titleItem.LocalizedCategories.map(item => {
                return (
                  <View style={styles.tagContainer} key={item}>
                    <Text variant="titleSmall">{item}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.description}>
              <Text variant="titleSmall">{description}</Text>
            </View>
          </ScrollView>

          <View style={styles.buttonWrap}>
            <Button
              mode="elevated"
              style={styles.button}
              onPress={handleStartGame}>
              &nbsp;{t('Start game')} &nbsp;
            </Button>
            <Button
              mode="text"
              style={styles.button}
              onPress={() => navigation.goBack()}>
              {t('Back')}
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    marginBottom: 120, // Adjust the marginBottom value to accommodate the button height
  },
  image: {
    width: '100%',
    height: 960 / 3,
  },
  textWrap: {
    padding: 10,
  },
  tagsWrap: {
    padding: 10,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tagContainer: {
    borderColor: '#999999',
    borderWidth: 1,
    borderRadius: 5,
    padding: 5,
    marginRight: 5,
    marginBottom: 10,
  },
  description: {
    paddingLeft: 10,
    paddingRight: 10,
  },
  productTitle: {
    marginBottom: 10,
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

export default TitleDetail;
