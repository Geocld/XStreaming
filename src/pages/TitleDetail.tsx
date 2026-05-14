import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Image,
  NativeModules,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {
  Text,
  Button,
  Portal,
  Modal,
  Card,
  HelperText,
  FAB,
} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {useDispatch} from 'react-redux';
import {getSettings} from '../store/settingStore';
import {getXcloudData, saveXcloudData} from '../store/xcloudStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';
import games from '../mock/games.json';

const {UsbRumbleManager, FullScreenManager} = NativeModules;

const log = debugFactory('TitleDetailScreen');

const warnTitles: any = [];
const webviewTitles: any = [];

function TitleDetail({navigation, route}) {
  const {t} = useTranslation();
  const {width: screenWidth, height: screenHeight} = useWindowDimensions();
  const dispatch = useDispatch();
  const [titleItem, setTitleItem] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const [starTitles, setStarTitles] = React.useState<any>([]);
  // const streamingTokens = useSelector(state => state.streamingTokens);
  const [showUsbWarnModal, setShowUsbWarnShowModal] = React.useState(false);
  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;

  React.useEffect(() => {
    log.info('TitleDetail titleItem:', route.params?.titleItem);
    // console.log(
    //   'TitleDetail titleItem:',
    //   JSON.stringify(route.params?.titleItem),
    // );
    if (route.params?.titleItem) {
      setTitleItem(route.params.titleItem);
    }
    const _settings = getSettings();
    setSettings(_settings);

    const cacheData = getXcloudData();

    if (cacheData) {
      setStarTitles(cacheData.starTitles || []);
    }

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
      routeName = settings.native_portrait_mode
        ? 'NativePortraitStream'
        : 'NativeStream';
    }

    // Lagecy user force to native stream
    if (isLagecy) {
      routeName = settings.native_portrait_mode
        ? 'NativePortraitStream'
        : 'NativeStream';
    }

    // Below titles use webview stream
    if (
      warnTitles.indexOf(titleId) > -1 ||
      webviewTitles.indexOf(titleId) > -1
    ) {
      routeName = 'Stream';
    }

    let postUrl = '';
    if (titleItem.Image_Poster && titleItem.Image_Poster.URL) {
      postUrl = `https:${titleItem.Image_Poster.URL}`;
    }

    navigation.navigate({
      name: routeName,
      params: {
        sessionId: titleId,
        settings,
        streamType: 'cloud',
        postUrl,
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

  const handleToggleStar = () => {
    if (!titleItem) {
      return;
    }
    const cacheData = getXcloudData();

    const newStarTitles = starTitles.includes(titleItem.XCloudTitleId)
      ? starTitles.filter(id => id !== titleItem.XCloudTitleId)
      : [...starTitles, titleItem.XCloudTitleId];
    setStarTitles(newStarTitles);

    dispatch({
      type: 'SET_STARS',
      payload: newStarTitles,
    });

    if (cacheData) {
      cacheData.starTitles = newStarTitles;
      saveXcloudData(cacheData);
    }
  };

  let isByorg = false;
  if (titleItem && titleItem.details && !titleItem.details.hasEntitlement) {
    isByorg = true;
  }

  let isStar = false;
  if (
    titleItem &&
    (starTitles.includes(titleItem.XCloudTitleId) ||
      starTitles.includes(titleItem.titleId))
  ) {
    isStar = true;
  }

  let description = '';
  if (
    titleItem &&
    games[titleItem.XboxTitleId] &&
    games[titleItem.XboxTitleId].short_description
  ) {
    description = games[titleItem.XboxTitleId].short_description;
  }

  const renderLargeActionButton = (
    label: string,
    onPress: () => void,
    primary = false,
  ) => {
    return (
      <Pressable
        focusable={true}
        hasTVPreferredFocus={primary}
        onPress={onPress}
        android_ripple={{
          color: primary
            ? 'rgba(255, 255, 255, 0.18)'
            : 'rgba(16, 124, 16, 0.16)',
        }}
        style={({focused, pressed}) => [
          styles.tvActionButton,
          primary ? styles.tvActionButtonPrimary : styles.tvActionButtonPlain,
          focused && styles.tvActionButtonFocused,
          pressed && styles.tvActionButtonPressed,
        ]}>
        <Text
          style={[
            styles.tvActionButtonText,
            primary
              ? styles.tvActionButtonTextPrimary
              : styles.tvActionButtonTextPlain,
          ]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderActionBar = () => {
    return (
      <View
        style={[styles.buttonWrap, isLargeScreen && styles.buttonWrapLarge]}>
        {isLargeScreen ? (
          <>
            {renderLargeActionButton(t('Start game'), handleStartGame, true)}
            {renderLargeActionButton(t('Back'), () => navigation.goBack())}
          </>
        ) : (
          <>
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
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Spinner loading={!titleItem} text={t('Loading...')} />

      {renderUsbWarningModal()}

      {titleItem && (
        <>
          <ScrollView
            style={[styles.scrollView, isLargeScreen && styles.scrollViewLarge]}
            contentContainerStyle={[
              styles.detailContent,
              isLargeScreen && styles.detailContentLarge,
            ]}>
            <View
              style={[
                styles.posterWrap,
                isLargeScreen && styles.posterWrapLarge,
              ]}>
              {titleItem.Image_Poster && (
                <Image
                  source={{
                    uri: 'https:' + titleItem.Image_Poster.URL,
                  }}
                  resizeMode={isLargeScreen ? 'cover' : 'center'}
                  style={[styles.image, isLargeScreen && styles.imageLarge]}
                />
              )}
            </View>

            <View
              style={[
                styles.infoPanel,
                isLargeScreen && styles.infoPanelLarge,
              ]}>
              <View style={styles.titleRow}>
                <View style={styles.titleTextWrap}>
                  <Text
                    variant={isLargeScreen ? 'headlineSmall' : 'titleLarge'}
                    style={styles.productTitle}>
                    {titleItem.ProductTitle}
                  </Text>
                  <Text
                    variant={isLargeScreen ? 'bodyMedium' : 'titleMedium'}
                    style={isLargeScreen && styles.publisherLarge}>
                    {titleItem.PublisherName}
                  </Text>
                </View>
                <FAB
                  icon={isStar ? 'cards-heart' : 'cards-heart-outline'}
                  size={isLargeScreen ? 'small' : 'medium'}
                  style={[styles.fab, isLargeScreen && styles.fabLarge]}
                  onPress={handleToggleStar}
                />
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

              {titleItem.LocalizedCategories && (
                <View style={styles.tagsWrap}>
                  {titleItem.LocalizedCategories.map(item => {
                    return (
                      <View
                        style={[
                          styles.tagContainer,
                          isLargeScreen && styles.tagContainerLarge,
                        ]}
                        key={item}>
                        <Text
                          variant={
                            isLargeScreen ? 'labelMedium' : 'titleSmall'
                          }>
                          {item}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <View
                style={[
                  styles.description,
                  isLargeScreen && styles.descriptionLarge,
                ]}>
                <Text variant={isLargeScreen ? 'bodyMedium' : 'titleSmall'}>
                  {description}
                </Text>
              </View>
            </View>
          </ScrollView>
          {renderActionBar()}
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
  },
  scrollViewLarge: {
    marginBottom: 0,
  },
  detailContent: {},
  detailContentLarge: {
    flexDirection: 'row',
    paddingHorizontal: 36,
    paddingVertical: 28,
    alignItems: 'flex-start',
  },
  posterWrap: {},
  posterWrapLarge: {
    width: 300,
    maxWidth: '34%',
  },
  image: {
    width: '100%',
    height: 960 / 3,
  },
  imageLarge: {
    height: 440,
    borderRadius: 12,
  },
  infoPanel: {
    paddingHorizontal: 10,
  },
  infoPanelLarge: {
    flex: 1,
    paddingLeft: 28,
    paddingRight: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tagsWrap: {
    paddingVertical: 10,
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
  tagContainerLarge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 8,
  },
  description: {
    paddingVertical: 8,
  },
  descriptionLarge: {
    maxWidth: 760,
    paddingTop: 12,
  },
  productTitle: {
    marginBottom: 8,
    letterSpacing: 0,
  },
  publisherLarge: {
    opacity: 0.78,
  },
  buttonWrap: {
    width: '100%',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 124, 16, 0.18)',
    backgroundColor: 'rgba(18, 18, 18, 0.96)',
  },
  buttonWrapLarge: {
    paddingHorizontal: 36,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  button: {
    marginTop: 10,
  },
  buttonLarge: {
    minWidth: 150,
    marginTop: 0,
    marginRight: 12,
  },
  tvActionButton: {
    minWidth: 150,
    height: 42,
    borderRadius: 8,
    marginRight: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tvActionButtonPrimary: {
    backgroundColor: '#107C10',
    borderColor: '#107C10',
  },
  tvActionButtonPlain: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(16, 124, 16, 0.42)',
  },
  tvActionButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  tvActionButtonPressed: {
    opacity: 0.78,
  },
  tvActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tvActionButtonTextPrimary: {
    color: '#FFFFFF',
  },
  tvActionButtonTextPlain: {
    color: '#107C10',
  },
  fab: {
    marginLeft: 12,
  },
  fabLarge: {
    marginLeft: 16,
  },
});

export default TitleDetail;
