import React from 'react';
import {
  Alert,
  StyleSheet,
  View,
  ScrollView,
  Image,
  NativeModules,
  Platform,
  Pressable,
  ToastAndroid,
  useWindowDimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
  Text,
  Button,
  Portal,
  Modal,
  Card,
  HelperText,
  IconButton,
  useTheme,
} from 'react-native-paper';
import Spinner from '../components/Spinner';
import { useDispatch, useSelector } from 'react-redux';
import { getSettings } from '../store/settingStore';
import { getXcloudData, saveXcloudData } from '../store/xcloudStore';
import {
  findTitleByProductId,
  getTitleProductId,
  getTitleStreamingId,
  saveTitleShortcutSnapshot,
} from '../store/shortcutStore';
import { useTranslation } from 'react-i18next';
import { useIsFocused } from '@react-navigation/native';
import { useGamepadNavigation } from '../utils/useGamepadNavigation';
import { debugFactory } from '../utils/debug';
import { storage } from '../store/mmkv';
import { isFreeWithAdsTitle, getCachedAccountTier } from '../utils/xcloud';
import games from '../mock/games.json';

const { UsbRumbleManager, FullScreenManager, ShortcutManager } = NativeModules;

const log = debugFactory('TitleDetailScreen');

const warnTitles: any = [];
const webviewTitles: any = [];

const STORE_GAMEPAD_INJECTED_JS = `
(function() {
  if (!document.getElementById('__gamepad_nav_styles')) {
    var style = document.createElement('style');
    style.id = '__gamepad_nav_styles';
    style.innerHTML = [
      '.xs-gamepad-active {',
      '  outline: 3px solid #107C10 !important;',
      '  outline-offset: 3px !important;',
      '  box-shadow: 0 0 12px rgba(16, 124, 16, 0.8) !important;',
      '  border-radius: 4px !important;',
      '}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  var focusedEl = null;

  function getFocusables() {
    var selectors = 'button, a[href], [role="button"], input, select, [tabindex="0"]';
    var all = Array.from(document.querySelectorAll(selectors));
    return all.filter(function(el) {
      if (el.disabled || el.getAttribute('tabindex') === '-1') return false;
      var rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.height > 15;
    });
  }

  function applyFocus(el) {
    if (focusedEl) {
      focusedEl.classList.remove('xs-gamepad-active');
    }
    focusedEl = el;
    if (el) {
      el.classList.add('xs-gamepad-active');
      if (typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  window.__gamepadNav = function(action) {
    if (action === 'select') {
      var target = focusedEl || document.activeElement;
      if (target && typeof target.click === 'function') {
        target.click();
      }
      return;
    }

    if (action === 'up' || action === 'down') {
      var items = getFocusables();
      if (items.length === 0) {
        window.scrollBy({ top: action === 'down' ? 260 : -260, behavior: 'smooth' });
        return;
      }

      var currIdx = focusedEl ? items.indexOf(focusedEl) : -1;
      if (action === 'down') {
        if (currIdx >= 0 && currIdx < items.length - 1) {
          applyFocus(items[currIdx + 1]);
        } else if (currIdx === items.length - 1) {
          window.scrollBy({ top: 260, behavior: 'smooth' });
        } else {
          var primaryBtn = items.find(function(i) {
            var text = (i.innerText || '').toLowerCase();
            return text.includes('beli') || text.includes('buy') || text.includes('get');
          }) || items[0];
          applyFocus(primaryBtn);
        }
      } else {
        if (currIdx > 0) {
          applyFocus(items[currIdx - 1]);
        } else if (currIdx === 0) {
          window.scrollBy({ top: -260, behavior: 'smooth' });
        } else {
          applyFocus(items[0]);
        }
      }
      return;
    }

    if (action === 'left' || action === 'right') {
      window.scrollBy({ left: action === 'right' ? 120 : -120, behavior: 'smooth' });
    }
  };

  setTimeout(function() {
    var items = getFocusables();
    var primaryBtn = items.find(function(i) {
      var text = (i.innerText || '').toLowerCase();
      return text.includes('beli') || text.includes('buy') || text.includes('get');
    });
    if (primaryBtn) {
      applyFocus(primaryBtn);
    }
  }, 1000);
})();
true;
`;

function TitleDetail({ navigation, route }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isLight = !theme.dark;
  const primary = theme.colors.primary;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const dispatch = useDispatch();
  const authentication = useSelector((state: any) => state.authentication);
  const [titleItem, setTitleItem] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>({});
  const [starTitles, setStarTitles] = React.useState<any>([]);
  const [shortcutLoadFailed, setShortcutLoadFailed] = React.useState(false);
  // const streamingTokens = useSelector(state => state.streamingTokens);
  const [showUsbWarnModal, setShowUsbWarnShowModal] = React.useState(false);
  const isLandscape = screenWidth > screenHeight;
  const isLargeScreen = Platform.isTV || isLandscape;
  const canAddTitleShortcut =
    Platform.OS === 'android' &&
    !Platform.isTV &&
    !!ShortcutManager?.addTitleShortcut;

  const isScreenFocused = useIsFocused();
  const [focusedBtn, setFocusedBtn] = React.useState<'start' | 'buy' | 'back'>('start');
  const [showStoreModal, setShowStoreModal] = React.useState(false);
  const [showPurchaseNotice, setShowPurchaseNotice] = React.useState(false);
  const [storeUrl, setStoreUrl] = React.useState('');
  const [storeCanGoBack, setStoreCanGoBack] = React.useState(false);
  const storeWebViewRef = React.useRef<any>(null);

  React.useEffect(() => {
    navigation.setOptions({
      headerShown: !showStoreModal,
    });
  }, [showStoreModal, navigation]);

  const isGameOwned = Boolean(
    titleItem?.details?.hasEntitlement || titleItem?.details?.isFreeInStore,
  );
  const isNotOwned = Boolean(
    titleItem &&
      titleItem.details &&
      !isGameOwned,
  );

  const lastStoreBackRef = React.useRef(0);

  const handleStoreBack = React.useCallback(() => {
    const now = Date.now();
    if (now - lastStoreBackRef.current < 1200 || !storeCanGoBack) {
      setShowStoreModal(false);
    } else {
      lastStoreBackRef.current = now;
      if (storeWebViewRef.current) {
        storeWebViewRef.current.goBack();
      } else {
        setShowStoreModal(false);
      }
    }
  }, [storeCanGoBack]);

  useGamepadNavigation({
    enabled: isScreenFocused && !showUsbWarnModal && !!titleItem,
    onLeft: () => {
      if (showStoreModal) {
        storeWebViewRef.current?.injectJavaScript(
          'window.__gamepadNav && window.__gamepadNav("left"); true;',
        );
        return;
      }
      setFocusedBtn(prev => {
        if (prev === 'back') return isNotOwned ? 'buy' : 'start';
        if (prev === 'buy') return 'start';
        return 'start';
      });
    },
    onRight: () => {
      if (showStoreModal) {
        storeWebViewRef.current?.injectJavaScript(
          'window.__gamepadNav && window.__gamepadNav("right"); true;',
        );
        return;
      }
      setFocusedBtn(prev => {
        if (prev === 'start') return isNotOwned ? 'buy' : 'back';
        if (prev === 'buy') return 'back';
        return 'back';
      });
    },
    onUp: () => {
      if (showStoreModal) {
        storeWebViewRef.current?.injectJavaScript(
          'window.__gamepadNav && window.__gamepadNav("up"); true;',
        );
        return;
      }
      setFocusedBtn(prev => {
        if (prev === 'back') return isNotOwned ? 'buy' : 'start';
        if (prev === 'buy') return 'start';
        return 'start';
      });
    },
    onDown: () => {
      if (showStoreModal) {
        storeWebViewRef.current?.injectJavaScript(
          'window.__gamepadNav && window.__gamepadNav("down"); true;',
        );
        return;
      }
      setFocusedBtn(prev => {
        if (prev === 'start') return isNotOwned ? 'buy' : 'back';
        if (prev === 'buy') return 'back';
        return 'back';
      });
    },
    onSelect: () => {
      if (showStoreModal) {
        if (showPurchaseNotice) {
          setShowPurchaseNotice(false);
          return;
        }
        storeWebViewRef.current?.injectJavaScript(
          'window.__gamepadNav && window.__gamepadNav("select"); true;',
        );
        return;
      }
      if (focusedBtn === 'start') {
        handleStartGame();
      } else if (focusedBtn === 'buy' && isNotOwned) {
        handleBuyGame();
      } else {
        navigation.goBack();
      }
    },
    onActionX: () => {
      if (showStoreModal) {
        if (showPurchaseNotice) {
          setShowPurchaseNotice(false);
          return;
        }
        storeWebViewRef.current?.injectJavaScript(
          'window.scrollBy({ top: 350, behavior: "smooth" }); true;',
        );
        return;
      }
      handleStartGame();
    },
    onActionY: () => {
      if (showStoreModal) {
        if (showPurchaseNotice) {
          setShowPurchaseNotice(false);
        }
        setShowStoreModal(false);
        return;
      }
    },
    onBack: () => {
      if (showStoreModal) {
        if (showPurchaseNotice) {
          setShowPurchaseNotice(false);
          return;
        }
        handleStoreBack();
        return;
      }
      navigation.goBack();
    },
  });

  React.useEffect(() => {
    log.info('TitleDetail titleItem:', route.params?.titleItem);
    // console.log(
    //   'TitleDetail titleItem:',
    //   JSON.stringify(route.params?.titleItem),
    // );
    let nextTitleItem = route.params?.titleItem;
    if (!nextTitleItem && route.params?.productId) {
      nextTitleItem = findTitleByProductId(route.params.productId);
    }

    if (nextTitleItem) {
      setTitleItem(nextTitleItem);
      setShortcutLoadFailed(false);
    } else if (route.params?.productId) {
      setTitleItem(null);
      setShortcutLoadFailed(true);
    }
    const _settings = getSettings();
    setSettings(_settings);

    const cacheData = getXcloudData();

    if (cacheData) {
      setStarTitles(cacheData.starTitles || []);
    }

    navigation.setOptions({
      title: nextTitleItem?.ProductTitle || '',
    });
  }, [route.params?.titleItem, route.params?.productId, navigation]);

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
    } else if (settings.render_engine === 'nano') {
      routeName = 'NativeStream';
    }

    // Lagecy user force to native stream
    if (isLagecy && routeName === 'Stream') {
      routeName = settings.native_portrait_mode
        ? 'NativePortraitStream'
        : 'NativeStream';
    }

    // Below titles use webview stream
    if (
      routeName !== 'NanoStream' &&
      (warnTitles.indexOf(titleId) > -1 || webviewTitles.indexOf(titleId) > -1)
    ) {
      routeName = 'Stream';
    }

    let postUrl = '';
    if (titleItem.Image_Poster && titleItem.Image_Poster.URL) {
      postUrl = `https:${titleItem.Image_Poster.URL}`;
    }

    const gameTitle =
      titleItem?.ProductTitle ||
      titleItem?.titleName ||
      titleItem?.Title ||
      'Xbox Cloud Gaming';

    navigation.navigate({
      name: routeName,
      params: {
        sessionId: titleId,
        settings,
        streamType: 'cloud',
        postUrl,
        isUsbMode,
        usbController,
        gameTitle,
        titleItem,
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
          contentContainerStyle={{ marginLeft: '4%', marginRight: '4%' }}>
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

  const handleAddToDesktop = async () => {
    if (!titleItem || !ShortcutManager?.addTitleShortcut) {
      Alert.alert(t('Warning'), t('TitleShortcutUnavailable'));
      return;
    }

    const productId = getTitleProductId(titleItem);
    if (!productId) {
      Alert.alert(t('Warning'), t('TitleShortcutMissingProduct'));
      return;
    }

    const titleName = titleItem.ProductTitle || productId;
    const iconUrl = titleItem.Image_Tile?.URL
      ? `https:${titleItem.Image_Tile.URL}`
      : titleItem.Image_Poster?.URL
        ? `https:${titleItem.Image_Poster.URL}`
        : '';

    saveTitleShortcutSnapshot(titleItem);

    try {
      await ShortcutManager.addTitleShortcut({
        productId,
        titleId: getTitleStreamingId(titleItem),
        xCloudTitleId: titleItem.XCloudTitleId || '',
        titleName,
        iconUrl,
      });
      ToastAndroid.show(t('TitleShortcutRequested'), ToastAndroid.SHORT);
    } catch (e: any) {
      const message =
        e?.code === 'SHORTCUT_UNSUPPORTED' ||
          e?.code === 'UNSUPPORTED_ANDROID_VERSION'
          ? t('TitleShortcutUnavailable')
          : `${t('TitleShortcutFailed')}: ${e?.message || e}`;
      Alert.alert(t('Warning'), message);
    }
  };

  const handleBuyGame = () => {
    const productId =
      getTitleProductId(titleItem) ||
      titleItem?.details?.productId ||
      titleItem?.details?.ProductId ||
      titleItem?.ProductId ||
      titleItem?.productId;
    let url = '';
    if (productId) {
      url = `https://www.xbox.com/games/store/p/${productId}`;
    } else if (titleItem?.ProductTitle) {
      url = `https://www.xbox.com/games/search?q=${encodeURIComponent(
        titleItem.ProductTitle,
      )}`;
    }
    if (url) {
      setStoreUrl(url);
      setShowPurchaseNotice(true);
      setShowStoreModal(true);
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
    isPrimaryAction = false,
    isFocused = false,
  ) => {
    return (
      <Pressable
        focusable={true}
        hasTVPreferredFocus={isPrimaryAction}
        onPress={onPress}
        style={({ focused, pressed }: any) => {
          const activeFocus = isFocused || focused;
          return [
            styles.tvActionButton,
            isPrimaryAction
              ? [styles.tvActionButtonPrimary, { backgroundColor: primary, borderColor: primary }]
              : [styles.tvActionButtonPlain, { borderColor: primary + '66' }],
            activeFocus && styles.tvActionButtonFocused,
            pressed && styles.tvActionButtonPressed,
          ];
        }}>
        <Text
          style={[
            styles.tvActionButtonText,
            isPrimaryAction
              ? styles.tvActionButtonTextPrimary
              : [styles.tvActionButtonTextPlain, { color: primary }],
          ]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const accountTier = React.useMemo(() => {
    if (route.params?.accountTier) {
      return route.params.accountTier;
    }
    const userKey =
      authentication?._tokenStore?.getUserToken?.()?.data?.gamertag ||
      authentication?._tokenStore?.getUserToken?.()?.data?.gamerpic ||
      storage.getString('user.account_tier_owner') ||
      '';
    return (
      (userKey ? getCachedAccountTier(userKey) : '') ||
      storage.getString('user.account_tier') ||
      'Free'
    );
  }, [route.params?.accountTier, authentication]);

  const isFreeTier = !accountTier || accountTier === 'Free';

  const isFreeWithAds = React.useMemo(() => {
    return isFreeTier && isFreeWithAdsTitle(titleItem);
  }, [isFreeTier, titleItem]);

  const startButtonLabel = isFreeWithAds
    ? t('Start cloud game with ads')
    : t('Start game');

  const buyButtonLabel = t('Get game');

  const statusBarHeight =
    Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;

  const renderStoreModal = () => {
    if (!showStoreModal || !storeUrl) {
      return null;
    }
    return (
      <View
        style={[
          styles.storeModalOverlay,
          {
            backgroundColor: theme.colors.background,
            paddingTop: statusBarHeight,
          },
        ]}>
        <StatusBar
          barStyle={isLight ? 'dark-content' : 'light-content'}
          backgroundColor="transparent"
          translucent={true}
        />
        <View
          style={[
            styles.storeModalHeader,
            { borderBottomColor: primary + '33' },
          ]}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={handleStoreBack}
          />
          <Text
            variant="titleMedium"
            numberOfLines={1}
            style={styles.storeModalTitle}>
            {titleItem?.ProductTitle || t('Get game')}
          </Text>
          <IconButton
            icon="close"
            size={24}
            onPress={() => setShowStoreModal(false)}
          />
        </View>
        <WebView
          ref={storeWebViewRef}
          source={{ uri: storeUrl }}
          userAgent="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          injectedJavaScript={STORE_GAMEPAD_INJECTED_JS}
          onLoadEnd={() => {
            storeWebViewRef.current?.injectJavaScript(STORE_GAMEPAD_INJECTED_JS);
          }}
          onNavigationStateChange={navState => {
            setStoreCanGoBack(navState.canGoBack);
          }}
          renderLoading={() => (
            <View style={styles.storeLoadingWrap}>
              <ActivityIndicator size="large" color={primary} />
            </View>
          )}
          style={styles.storeWebView}
        />
        {showPurchaseNotice && (
          <View style={styles.purchaseNoticeOverlay}>
            <Card style={styles.purchaseNoticeCard}>
              <Card.Title
                title={t('PurchaseNoticeTitle')}
                titleStyle={{ fontWeight: 'bold' }}
                left={(props: any) => (
                  <IconButton
                    {...props}
                    icon="information-outline"
                    iconColor={primary}
                  />
                )}
              />
              <Card.Content>
                <Text variant="bodyMedium" style={styles.purchaseNoticeText}>
                  {t('PurchaseNoticeDesc')}
                </Text>
              </Card.Content>
              <Card.Actions>
                <Button
                  mode="contained"
                  style={{ backgroundColor: primary }}
                  onPress={() => setShowPurchaseNotice(false)}>
                  {t('Close')}
                </Button>
              </Card.Actions>
            </Card>
          </View>
        )}
      </View>
    );
  };

  const renderActionBar = () => {
    return (
      <View
        style={[
          styles.buttonWrap,
          {
            backgroundColor: isLight
              ? 'rgba(255, 255, 255, 0.96)'
              : 'rgba(18, 18, 18, 0.96)',
            borderTopColor: primary + '2E',
          },
          isLargeScreen && styles.buttonWrapLarge,
        ]}>
        {isLargeScreen ? (
          <>
            {renderLargeActionButton(
              startButtonLabel,
              handleStartGame,
              true,
              focusedBtn === 'start',
            )}
            {isNotOwned &&
              renderLargeActionButton(
                buyButtonLabel,
                handleBuyGame,
                false,
                focusedBtn === 'buy',
              )}
            {renderLargeActionButton(
              t('Back'),
              () => navigation.goBack(),
              false,
              focusedBtn === 'back',
            )}
          </>
        ) : (
          <>
            <Button
              mode="elevated"
              style={[
                styles.button,
                focusedBtn === 'start' && styles.buttonFocused,
              ]}
              onPress={handleStartGame}>
              &nbsp;{startButtonLabel} &nbsp;
            </Button>
            {isNotOwned && (
              <Button
                mode="outlined"
                style={[
                  styles.button,
                  focusedBtn === 'buy' && styles.buttonFocused,
                ]}
                textColor={primary}
                onPress={handleBuyGame}>
                &nbsp;{buyButtonLabel} &nbsp;
              </Button>
            )}
            <Button
              mode={focusedBtn === 'back' ? 'elevated' : 'text'}
              style={[
                styles.button,
                focusedBtn === 'back' && styles.buttonFocused,
              ]}
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
      <Spinner
        loading={!titleItem && !shortcutLoadFailed}
        text={t('Loading...')}
      />

      {renderUsbWarningModal()}

      {shortcutLoadFailed && (
        <View style={styles.errorWrap}>
          <HelperText type="error" visible={true}>
            {t('TitleShortcutExpired')}
          </HelperText>
          <Button mode="text" onPress={() => navigation.goBack()}>
            {t('Back')}
          </Button>
        </View>
      )}

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
                <View style={styles.titleActions}>
                  {canAddTitleShortcut && (
                    <IconButton
                      icon="plus-box-outline"
                      size={isLargeScreen ? 24 : 22}
                      accessibilityLabel={t('Add to desktop')}
                      style={styles.titleActionButton}
                      onPress={handleAddToDesktop}
                    />
                  )}
                  <IconButton
                    icon={isStar ? 'cards-heart' : 'cards-heart-outline'}
                    size={isLargeScreen ? 24 : 22}
                    accessibilityLabel={t('Stars')}
                    style={styles.titleActionButton}
                    onPress={handleToggleStar}
                  />
                </View>
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
      {renderStoreModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
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
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  titleActionButton: {
    margin: 0,
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
    transform: [{ scale: 1 }],
  },
  buttonLarge: {
    minWidth: 150,
    marginTop: 0,
    marginRight: 12,
  },
  tvActionButton: {
    minWidth: 150,
    height: 42,
    transform: [{ scale: 1 }],
    borderRadius: 8,
    marginRight: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  tvActionButtonPrimary: {
    backgroundColor: '#107C10',
    borderColor: '#107C10',
  },
  tvActionButtonPlain: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(16, 124, 16, 0.42)',
  },
  buttonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
    transform: [{ scale: 1.04 }],
    elevation: 8,
  },
  tvActionButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    transform: [{ scale: 1.05 }],
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.6,
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
  storeModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  storeModalContainer: {
    flex: 1,
  },
  storeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  storeModalTitle: {
    flex: 1,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  storeWebView: {
    flex: 1,
  },
  storeLoadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  purchaseNoticeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10000,
  },
  purchaseNoticeCard: {
    maxWidth: 480,
    width: '100%',
    borderRadius: 12,
  },
  purchaseNoticeText: {
    lineHeight: 22,
    marginVertical: 8,
  },
});

export default TitleDetail;
