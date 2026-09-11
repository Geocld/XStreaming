import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Dimensions,
  useWindowDimensions,
  SafeAreaView,
  NativeModules,
  ToastAndroid,
  Linking,
  BackHandler,
} from 'react-native';
import {Button, Text, Portal, Modal, Card, useTheme} from 'react-native-paper';
import {useIsFocused} from '@react-navigation/native';
import RNRestart from 'react-native-restart';
import ConsoleItem from '../components/ConsoleItem';
import HomeItem from '../components/HomeItem';
import GamepadFooterHints, {
  GamepadHintItem,
} from '../components/GamepadFooterHints';
import {getSettings, saveSettings} from '../store/settingStore';

import Authentication from '../Authentication';
import MsalAuthentication from '../MsalAuthentication';
import WebApi from '../web';
import {
  useGamepadNavigation,
  useGamepadActiveState,
} from '../utils/useGamepadNavigation';

import {useSelector, useDispatch} from 'react-redux';
import SplashScreen from 'react-native-splash-screen';
import {useTranslation} from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import {debugFactory} from '../utils/debug';
import XcloudApi from '../xCloud';
import {
  saveConsolesData,
  getConsolesData,
  isConsolesDataValid,
} from '../store/consolesStore';
import MsalAuth from '../components/MsalAuth';
import SessionReportModal from '../components/SessionReportModal';

const log = debugFactory('HomeScreen');

const {UsbRumbleManager, FullScreenManager} = NativeModules;

const HARMOBY_URL =
  'https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh';

const MSAL = 'msal';

function HomeScreen({navigation, route}) {
  const {t} = useTranslation();
  const theme = useTheme();
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [_, setXalUrl] = React.useState('');
  const [consoles, setConsoles] = React.useState<any[]>(() => {
    const cacheData = getConsolesData();
    if (
      cacheData &&
      isConsolesDataValid(cacheData) &&
      Array.isArray(cacheData.consoles)
    ) {
      return cacheData.consoles;
    }
    return [];
  });
  const [isConnected, setIsConnected] = React.useState(true);
  const [currentConsoleId, setCurrentConsoleId] = React.useState('');
  const [showUsbWarnModal, setShowUsbWarnShowModal] = React.useState(false);
  const [showHarmonyModal, setShowHarmonyModal] = React.useState(false);
  const [numColumns, setNumColumns] = React.useState(2);
  const [showLogin, setShowLogin] = React.useState(false);
  const [showMsalLogin, setShowMsalLogin] = React.useState(false);
  const [showMsal, setShowMsal] = React.useState(false);
  const [msalBtnLoading, setMsalBtnLoading] = React.useState(false);
  const [msalData, setMsalData] = React.useState(null);

  // Session report modal state
  const [sessionReport, setSessionReport] = React.useState<any>(null);

  React.useEffect(() => {
    if (route?.params?.sessionReport) {
      const currentSettings = getSettings();
      const isShowReport =
        String(currentSettings.show_session_report) === 'true';
      if (isShowReport) {
        setSessionReport(route.params.sessionReport);
      }
    }
  }, [route?.params?.sessionReport]);

  const handleDismissReport = React.useCallback(() => {
    setSessionReport(null);
    navigation.setParams({sessionReport: undefined});
  }, [navigation]);

  const handleDoneReport = React.useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain) {
        const currentSettings = getSettings();
        saveSettings({...currentSettings, show_session_report: false});
      }
      setSessionReport(null);
      navigation.setParams({sessionReport: undefined});
    },
    [navigation],
  );

  const authentication = useSelector((state: any) => state.authentication);
  const _authentication = React.useRef(authentication);

  const redirect = useSelector((state: any) => state.redirect);
  const _redirect = React.useRef(redirect);

  const isLogined = useSelector((state: any) => state.isLogined);
  const _isLogined = React.useRef(isLogined);

  const webToken = useSelector((state: any) => state.webToken);
  const webTokenRef = React.useRef(null);

  const _xHomeApiRef = React.useRef<any>(null);

  const dispatch = useDispatch();

  const isFocused = useIsFocused();
  const _isFocused = React.useRef(isFocused);
  React.useEffect(() => {
    _isFocused.current = isFocused;
  }, [isFocused]);

  const {width, height} = useWindowDimensions();
  const emptyConsoleCardStyle = React.useMemo(
    () => [styles.emptyConsoleCard, theme.dark && styles.emptyConsoleCardDark],
    [theme.dark],
  );

  // 1. One-time mount initialization (listeners, non-blocking checks)
  React.useEffect(() => {
    log.info('Page loaded.');
    SplashScreen.hide();

    const updateLayout = () => {
      const {width: w, height: h} = Dimensions.get('window');
      setNumColumns(w > h ? 4 : 2);
    };

    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);

    const unsubscribeNet = NetInfo.addEventListener((state: any) => {
      setIsConnected(state.isConnected);
    });

    // Defer heavy synchronous native calls so they don't block the initial render frame
    const timer = setTimeout(() => {
      try {
        const _settings = getSettings();
        const webviewVersion = FullScreenManager?.getWebViewVersion?.();
        const deviceInfos = FullScreenManager?.getDeviceInfos?.();
        if (webviewVersion && deviceInfos) {
          const verArr = webviewVersion.split('.');
          const mainVer = parseInt(verArr[0], 10);
          if (deviceInfos.androidVer < 12 && mainVer < 91) {
            _settings.render_engine = 'native';
            saveSettings(_settings);
          }
        }

        if (
          deviceInfos &&
          deviceInfos.factor &&
          deviceInfos.factor.indexOf('HUAWEI') > -1 &&
          _settings.locale === 'zh' &&
          _settings.show_harmony_modal
        ) {
          setShowHarmonyModal(true);
        }
      } catch (err) {
        log.warn('Device info check error:', err);
      }
    }, 500);

    return () => {
      subscription?.remove();
      unsubscribeNet();
      clearTimeout(timer);
    };
  }, []);

  // 2. Authentication & Consoles Synchronization
  React.useEffect(() => {
    if (!isConnected) {
      Alert.alert(
        t('Warning'),
        t('Currently no network connection, please connect and try again'),
        [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {},
          },
        ],
      );
      return;
    }

    const _settings = getSettings();

    // Auth completed callback
    const authenticationCompleted = async (
      _streamingTokens: any,
      _webToken: any,
    ) => {
      log.info('Authentication completed');
      webTokenRef.current = _webToken;
      dispatch({
        type: 'SET_STREAMING_TOKEN',
        payload: _streamingTokens,
      });
      dispatch({
        type: 'SET_WEB_TOKEN',
        payload: _webToken,
      });
      dispatch({
        type: 'SET_LOGIN',
        payload: true,
      });
      _isLogined.current = true;
      setShowLogin(false);
      setShowMsalLogin(false);
      setShowMsal(false);

      const webApi = new WebApi(_webToken);

      try {
        const _xHomeApi = new XcloudApi(
          _streamingTokens.xHomeToken.getDefaultRegion().baseUri,
          _streamingTokens.xHomeToken.data.gsToken,
          'home',
          () => {},
        );
        _xHomeApiRef.current = _xHomeApi;

        let _consoles: any = await _xHomeApi.getConsoles();

        if (!_consoles || !_consoles.length) {
          _consoles = await webApi.getConsoles();
        }

        if (_consoles && _consoles.length > 0) {
          setConsoles(_consoles);
          saveConsolesData({
            consoles: _consoles,
          });
        }
      } catch (e: any) {
        log.error('Fetch consoles error:', e);
      } finally {
        setLoading(false);
      }
    };

    // Auth failed callback
    const authenticationFailed = (msg: any, rollback = false) => {
      setLoading(false);
      if (rollback) {
        Alert.alert(t('Error'), t('XalAuthFailDesc') + msg, [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {
              _authentication.current = new MsalAuthentication(
                authenticationCompleted,
                authenticationFailed,
              );
              dispatch({
                type: 'SET_AUTHENTICATION',
                payload: _authentication.current,
              });
              setShowMsalLogin(true);
            },
          },
        ]);
      } else {
        Alert.alert(t('Error'), t('AuthFailDesc') + msg, [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {
              RNRestart.restart();
            },
          },
        ]);
      }
    };

    if (!_authentication.current) {
      log.info('Authentication initial.');

      _authentication.current = new Authentication(
        authenticationCompleted,
        authenticationFailed,
      );
      _authentication.current._tokenStore.load();

      if (
        _settings.use_msal_login ||
        _authentication.current._tokenStore.getAuthenticationMethod() === MSAL
      ) {
        log.info('Using MSAL authentication method.');
        _authentication.current = new MsalAuthentication(
          authenticationCompleted,
          authenticationFailed,
        );
      }
      dispatch({
        type: 'SET_AUTHENTICATION',
        payload: _authentication.current,
      });
    }

    if (route.params?.xalUrl) {
      if (!_isLogined.current) {
        log.info('HomeScreen receive xalUrl:', route.params?.xalUrl);
        setXalUrl(route.params.xalUrl);
        setLoading(true);
        setLoadingText(t('Login successful, refreshing login credentials...'));
        _authentication.current.startAuthflow(
          _redirect.current,
          route.params.xalUrl,
        );
      }
    } else if (route.params?.needRefresh && webTokenRef.current) {
      if (_xHomeApiRef.current) {
        const webApi = new WebApi(webTokenRef.current);
        _xHomeApiRef.current.getConsoles().then((_consoles: any) => {
          if (!_consoles.length) {
            webApi.getConsoles().then((_consolesV1: any) => {
              if (_consolesV1.length) {
                setConsoles(_consolesV1);
                saveConsolesData({consoles: _consolesV1});
              }
            });
          } else {
            setConsoles(_consoles);
            saveConsolesData({consoles: _consoles});
          }
        });
      }
    } else if (!_isLogined.current && _isFocused.current) {
      // If we already have cached consoles displayed, refresh silently without freezing UI
      const hasCachedConsoles = consoles.length > 0;
      if (!hasCachedConsoles) {
        setLoading(true);
        setLoadingText(t('Checking login status...'));
      }

      _authentication.current
        .checkAuthentication()
        .then((isAuth: boolean) => {
          if (!isAuth) {
            setLoading(false);
            if (_settings.use_msal_login) {
              setShowLogin(false);
              setShowMsalLogin(true);
              setShowMsal(false);
            } else {
              _authentication.current._xal
                .getRedirectUri()
                .then((redirectObj: any) => {
                  setLoading(false);
                  log.info('Redirect:', redirectObj);
                  _redirect.current = redirectObj;
                  dispatch({
                    type: 'SET_REDIRECT',
                    payload: redirectObj,
                  });
                  setShowLogin(true);
                  setShowMsalLogin(false);
                  setShowMsal(false);
                })
                .catch(() => {
                  _authentication.current = new MsalAuthentication(
                    authenticationCompleted,
                    authenticationFailed,
                  );
                  dispatch({
                    type: 'SET_AUTHENTICATION',
                    payload: _authentication.current,
                  });
                  setLoading(false);
                  setShowLogin(false);
                  setShowMsalLogin(true);
                  setShowMsal(false);
                });
            }
          }
        })
        .catch((e: any) => {
          setLoading(false);
          Alert.alert(t('Error'), e);
          _authentication.current = new MsalAuthentication(
            authenticationCompleted,
            authenticationFailed,
          );
          dispatch({
            type: 'SET_AUTHENTICATION',
            payload: _authentication.current,
          });
          setShowLogin(false);
          setShowMsalLogin(true);
          setShowMsal(false);
        });
    }
  }, [route.params?.xalUrl, route.params?.needRefresh, isConnected]);

  const handlePoweronAndStream = async sessionId => {
    setLoading(true);
    setLoadingText(t('Loading...'));
    const webApi = new WebApi(webToken);
    try {
      const powerOnRes = await webApi.powerOn(sessionId);
      log.info('powerOn:', powerOnRes);

      let _consoles = await _xHomeApiRef.current.getConsoles();

      if (!_consoles.length) {
        _consoles = await webApi.getConsoles();
      }

      if (_consoles.length > 0) {
        setConsoles(_consoles);
      }

      setLoading(false);

      handleStartStream(sessionId);
    } catch (e) {
      setLoading(false);

      handleStartStream(sessionId);
    }
  };

  const handlePower = async (sessionId, off = false) => {
    setLoading(true);
    setLoadingText(t('Loading...'));
    const webApi = new WebApi(webToken);
    try {
      if (off) {
        const powerOnRes = await webApi.powerOff(sessionId);
        log.info('powerOff:', powerOnRes);
        ToastAndroid.show(t('PoweredOffSentText'), ToastAndroid.SHORT);
      } else {
        const powerOnRes = await webApi.powerOn(sessionId);
        log.info('powerOn:', powerOnRes);
        ToastAndroid.show(t('PoweredOnSentText'), ToastAndroid.SHORT);
      }

      let _consoles = await _xHomeApiRef.current.getConsoles();

      if (!_consoles.length) {
        _consoles = await webApi.getConsoles();
      }

      if (_consoles.length > 0) {
        setConsoles(_consoles);
      }

      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  };

  const handleRefreshConsoles = async () => {
    setLoading(true);
    setLoadingText(t('Loading...'));

    try {
      const webApi = new WebApi(webToken);
      let _consoles: any = [];

      if (_xHomeApiRef.current) {
        _consoles = await _xHomeApiRef.current.getConsoles();
      }

      if (!_consoles.length) {
        _consoles = await webApi.getConsoles();
      }

      if (_consoles.length > 0) {
        setConsoles(_consoles);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartStream = async sessionId => {
    const settings = getSettings();
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    setCurrentConsoleId(sessionId);
    if (isUsbMode && !Platform.isTV) {
      setShowUsbWarnShowModal(true);
    } else {
      handleNavigateStream(sessionId);
    }
  };

  const handleNavigateStream = async sessionId => {
    const settings = getSettings();
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
      routeName = 'NanoStream';
    }

    // Lagecy user force to native stream
    if (isLagecy && routeName === 'Stream') {
      routeName = settings.native_portrait_mode
        ? 'NativePortraitStream'
        : 'NativeStream';
    }

    navigation.navigate({
      name: routeName,
      params: {
        sessionId,
        settings,
        isUsbMode,
        usbController,
      },
    });
  };

  // Focus navigation state for gamepad / TV remote
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState();
  const [focusedSection, setFocusedSection] = React.useState<
    'consoles' | 'refresh' | 'more'
  >('more');
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);

  // Sync focusedSection when consoles change
  React.useEffect(() => {
    if (consoles.length > 0 && focusedSection === 'refresh') {
      setFocusedSection('consoles');
      setFocusedIndex(0);
    }
  }, [consoles.length, focusedSection]);

  useGamepadNavigation({
    enabled:
      isFocused &&
      !loading &&
      !showLogin &&
      !showMsalLogin &&
      !showMsal &&
      !showUsbWarnModal &&
      !showHarmonyModal &&
      !sessionReport,
    onRight: () => {
      if (focusedSection === 'consoles') {
        if (focusedIndex < consoles.length - 1) {
          setFocusedIndex(prev => prev + 1);
        }
      } else if (focusedSection === 'more') {
        if (focusedIndex < 2) {
          setFocusedIndex(prev => prev + 1);
        }
      }
    },
    onLeft: () => {
      if (focusedIndex > 0) {
        setFocusedIndex(prev => prev - 1);
      }
    },
    onDown: () => {
      if (focusedSection === 'consoles') {
        if (focusedIndex + numColumns < consoles.length) {
          setFocusedIndex(prev => prev + numColumns);
        } else {
          setFocusedSection('more');
          setFocusedIndex(0);
        }
      } else if (focusedSection === 'refresh') {
        setFocusedSection('more');
        setFocusedIndex(0);
      }
    },
    onUp: () => {
      if (focusedSection === 'more') {
        if (consoles.length > 0) {
          setFocusedSection('consoles');
          setFocusedIndex(0);
        } else {
          setFocusedSection('refresh');
          setFocusedIndex(0);
        }
      } else if (focusedSection === 'consoles') {
        if (focusedIndex >= numColumns) {
          setFocusedIndex(prev => prev - numColumns);
        }
      }
    },
    onSelect: () => {
      if (focusedSection === 'consoles') {
        const item: any = consoles[focusedIndex];
        if (item) {
          handleStartStream(item.serverId);
        }
      } else if (focusedSection === 'refresh') {
        handleRefreshConsoles();
      } else if (focusedSection === 'more') {
        if (focusedIndex === 0) {
          navigation.navigate('Cloud');
        } else if (focusedIndex === 1) {
          navigation.navigate('Achivements');
        } else if (focusedIndex === 2) {
          navigation.navigate('Settings');
        }
      }
    },
    onActionX: () => {
      if (focusedSection === 'consoles') {
        const item: any = consoles[focusedIndex];
        if (item) {
          handlePoweronAndStream(item.serverId);
        }
      } else if (focusedSection === 'more' && focusedIndex === 0) {
        navigation.navigate('Cloud');
      }
    },
    onBack: () => {
      BackHandler.exitApp();
    },
  });

  // Focus navigation state for login buttons (when not logged in)
  const [focusedLoginBtn, setFocusedLoginBtn] = React.useState<
    'login' | 'settings'
  >('login');
  const [focusedHarmonyBtn, setFocusedHarmonyBtn] = React.useState<
    'dismiss' | 'install'
  >('install');

  useGamepadNavigation({
    enabled:
      isFocused &&
      !loading &&
      (showLogin || showMsalLogin) &&
      !showMsal &&
      !showUsbWarnModal &&
      !showHarmonyModal &&
      !sessionReport,
    priority: 5,
    onUp: () => {
      setFocusedLoginBtn('login');
    },
    onDown: () => {
      setFocusedLoginBtn('settings');
    },
    onSelect: () => {
      if (focusedLoginBtn === 'login') {
        if (showLogin) {
          handleLogin();
        } else if (showMsalLogin) {
          handleMsalLogin();
        }
      } else {
        navigation.navigate('Settings');
      }
    },
    onBack: () => {
      BackHandler.exitApp();
    },
  });

  useGamepadNavigation({
    enabled: isFocused && showUsbWarnModal,
    priority: 10,
    onSelect: () => {
      setShowUsbWarnShowModal(false);
      handleNavigateStream(currentConsoleId);
    },
    onBack: () => {
      setShowUsbWarnShowModal(false);
    },
  });

  useGamepadNavigation({
    enabled: isFocused && showHarmonyModal,
    priority: 10,
    onLeft: () => setFocusedHarmonyBtn('dismiss'),
    onRight: () => setFocusedHarmonyBtn('install'),
    onUp: () => setFocusedHarmonyBtn('dismiss'),
    onDown: () => setFocusedHarmonyBtn('install'),
    onSelect: () => {
      if (focusedHarmonyBtn === 'install') {
        Linking.openURL(HARMOBY_URL);
        setShowHarmonyModal(false);
      } else {
        let _settings = getSettings();
        _settings.show_harmony_modal = false;
        saveSettings(_settings);
        setShowHarmonyModal(false);
      }
    },
    onBack: () => {
      setShowHarmonyModal(false);
    },
  });

  const gamepadHints: GamepadHintItem[] = React.useMemo(() => {
    return [
      {button: 'A', label: t('Select')},
      {button: 'B', label: t('Exit')},
    ];
  }, [t]);

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
                mode="contained"
                style={styles.actionButtonFocused}
                onPress={() => {
                  setShowUsbWarnShowModal(false);
                  handleNavigateStream(currentConsoleId);
                }}>
                {t('Confirm')}
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderHarmonyModal = () => {
    if (!showHarmonyModal) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={true}
          onDismiss={() => {
            setShowHarmonyModal(false);
          }}
          contentContainerStyle={{marginLeft: '4%', marginRight: '4%'}}>
          <Card>
            <Card.Content>
              <Text>
                XStreaming鸿蒙版已正式发布App Gallery，如您的设备系统为HarmonyOS
                5以上，您可以安装原生版本以获得更好的串流体验(点击立即下载或应用商店搜索"XStreaming"进行安装)。
              </Text>

              <Button
                mode={focusedHarmonyBtn === 'dismiss' ? 'contained' : 'text'}
                style={
                  focusedHarmonyBtn === 'dismiss'
                    ? styles.actionButtonFocused
                    : undefined
                }
                onPress={() => {
                  let _settings = getSettings();
                  _settings.show_harmony_modal = false;
                  saveSettings(_settings);
                  setShowHarmonyModal(false);
                }}>
                不再提示
              </Button>
              <Button
                mode={
                  focusedHarmonyBtn === 'install' ? 'contained' : 'elevated'
                }
                style={
                  focusedHarmonyBtn === 'install'
                    ? styles.actionButtonFocused
                    : undefined
                }
                onPress={() => {
                  Linking.openURL(HARMOBY_URL);
                  setShowHarmonyModal(false);
                }}>
                去安装
              </Button>
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const handleLogin = () => {
    if (_redirect.current && _redirect.current.sisuAuth) {
      navigation.navigate('Login', {
        authUrl: _redirect.current.sisuAuth.MsaOauthRedirect,
      });
    }
  };

  const handleMsalLogin = () => {
    setMsalBtnLoading(true);
    _authentication.current
      .getMsalDeviceCode()
      .then(data => {
        log.info('MSAL device code response:', data);
        _authentication.current.doPollForDeviceCodeAuth(data.device_code);
        setMsalData(data);
        setShowMsalLogin(false);
        setShowMsal(true);
        setMsalBtnLoading(false);
      })
      .catch(e => {
        log.error('MSAL device code error:', e);
        Alert.alert(t('Error'), 'MSAL device code error' + e, [
          {
            text: t('Confirm'),
            style: 'default',
            onPress: () => {
              setMsalBtnLoading(false);
            },
          },
        ]);
      });
  };

  const renderLogin = () => {
    const isLoginFocused =
      (isGamepadActive || Platform.isTV) && focusedLoginBtn === 'login';
    const isSettingsFocused =
      (isGamepadActive || Platform.isTV) && focusedLoginBtn === 'settings';

    return (
      <View style={styles.loginCard}>
        <Text style={styles.title}>{t('NoLogin')}</Text>
        <Button
          style={[
            styles.loginButton,
            isLoginFocused && styles.actionButtonFocused,
          ]}
          mode={isLoginFocused ? 'contained' : 'outlined'}
          buttonColor={isLoginFocused ? theme.colors.primary : undefined}
          textColor={isLoginFocused ? '#FFFFFF' : undefined}
          onPress={handleLogin}>
          &nbsp;{t('Login')}&nbsp;
        </Button>

        <Button
          style={[
            styles.loginButton,
            styles.mt10,
            isSettingsFocused && styles.actionButtonFocused,
          ]}
          mode={isSettingsFocused ? 'contained' : 'text'}
          buttonColor={isSettingsFocused ? theme.colors.primary : undefined}
          textColor={isSettingsFocused ? '#FFFFFF' : undefined}
          onPress={() => navigation.navigate('Settings')}>
          &nbsp;{t('Settings')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderMsalLogin = () => {
    const isLoginFocused =
      (isGamepadActive || Platform.isTV) && focusedLoginBtn === 'login';
    const isSettingsFocused =
      (isGamepadActive || Platform.isTV) && focusedLoginBtn === 'settings';

    return (
      <View style={styles.loginCard}>
        <Button
          style={[
            styles.loginButton,
            isLoginFocused && styles.actionButtonFocused,
          ]}
          mode={isLoginFocused ? 'contained' : 'outlined'}
          buttonColor={isLoginFocused ? theme.colors.primary : undefined}
          textColor={isLoginFocused ? '#FFFFFF' : undefined}
          loading={msalBtnLoading}
          onPress={handleMsalLogin}>
          &nbsp;{t('AuthLogin')}&nbsp;
        </Button>

        <Button
          style={[
            styles.loginButton,
            styles.mt10,
            isSettingsFocused && styles.actionButtonFocused,
          ]}
          mode={isSettingsFocused ? 'contained' : 'text'}
          buttonColor={isSettingsFocused ? theme.colors.primary : undefined}
          textColor={isSettingsFocused ? '#FFFFFF' : undefined}
          onPress={() => navigation.navigate('Settings')}>
          &nbsp;{t('Settings')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderLoadingOverlay = () => {
    if (!loading) {
      return null;
    }
    return (
      <View style={styles.nonModalLoadingOverlay}>
        <ActivityIndicator size="large" color="#107C10" />
        {loadingText ? (
          <Text style={styles.nonModalLoadingText}>{loadingText}</Text>
        ) : null}
      </View>
    );
  };

  const renderContent = () => {
    if (
      loading &&
      consoles.length === 0 &&
      !showLogin &&
      !showMsalLogin &&
      !showMsal
    ) {
      return null;
    }
    if (showLogin) {
      return <View style={styles.centerContainer}>{renderLogin()}</View>;
    } else if (showMsalLogin) {
      return <View style={styles.centerContainer}>{renderMsalLogin()}</View>;
    } else if (showMsal) {
      return (
        <View style={styles.centerContainer}>
          <MsalAuth
            data={msalData}
            onCancel={() => {
              setShowMsal(false);
              setShowMsalLogin(true);
            }}
          />
        </View>
      );
    } else {
      return (
        <SafeAreaView
          style={styles.container}
          onTouchStart={() => {
            if (!Platform.isTV) setIsGamepadActive(false);
          }}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              (isGamepadActive || Platform.isTV) && {paddingBottom: 64},
            ]}>
            <View style={[styles.blockTitle]}>
              <Text variant="titleLarge" style={styles.blockTitleText}>
                {t('Consoles')}
              </Text>
            </View>

            {consoles.length > 0 ? (
              <View style={styles.consoleList}>
                <View style={styles.consoleGrid}>
                  {consoles.map((item: any, index: number) => {
                    const isItemFocused =
                      (isGamepadActive || Platform.isTV) &&
                      focusedSection === 'consoles' &&
                      focusedIndex === index;
                    return (
                      <View
                        key={item.serverId || index}
                        style={[
                          styles.consoleItem,
                          numColumns === 4
                            ? styles.listItemH
                            : styles.listItemV,
                          isItemFocused && {zIndex: 99, overflow: 'visible'},
                        ]}>
                        <ConsoleItem
                          isFocused={isItemFocused}
                          consoleItem={item}
                          onPress={() => handleStartStream(item.serverId)}
                          onPoweronStream={() =>
                            handlePoweronAndStream(item.serverId)
                          }
                          onPoweron={() => handlePower(item.serverId)}
                          onPoweroff={() => handlePower(item.serverId, true)}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.noConsoles}>
                <View style={emptyConsoleCardStyle}>
                  <Text style={styles.emptyConsoleDesc}>{t('NoConsoles')}</Text>
                  <View style={styles.emptyConsoleActions}>
                    <Button
                      mode={
                        (isGamepadActive || Platform.isTV) &&
                        focusedSection === 'refresh'
                          ? 'elevated'
                          : 'contained-tonal'
                      }
                      style={[
                        styles.emptyActionBtn,
                        (isGamepadActive || Platform.isTV) &&
                          focusedSection === 'refresh' &&
                          styles.actionButtonFocused,
                      ]}
                      onPress={handleRefreshConsoles}>
                      {t('Refresh')}
                    </Button>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.blockTitle}>
              <Text variant="titleLarge" style={styles.blockTitleText}>
                {t('More')}
              </Text>
            </View>

            <View style={styles.moreItems}>
              <View
                style={[
                  styles.moreItem,
                  {width: width > 600 ? '15%' : width / 2 - 40},
                  (isGamepadActive || Platform.isTV) &&
                    focusedSection === 'more' &&
                    focusedIndex === 0 && {zIndex: 99, overflow: 'visible'},
                ]}>
                <HomeItem
                  isFocused={
                    (isGamepadActive || Platform.isTV) &&
                    focusedSection === 'more' &&
                    focusedIndex === 0
                  }
                  title={t('Xcloud')}
                  icon={'google-controller'}
                  color={'#FFB900'}
                  onPress={() => navigation.navigate('Cloud')}
                />
              </View>

              <View
                style={[
                  styles.moreItem,
                  {width: width > 600 ? '15%' : width / 2 - 40},
                  (isGamepadActive || Platform.isTV) &&
                    focusedSection === 'more' &&
                    focusedIndex === 1 && {zIndex: 99, overflow: 'visible'},
                ]}>
                <HomeItem
                  isFocused={
                    (isGamepadActive || Platform.isTV) &&
                    focusedSection === 'more' &&
                    focusedIndex === 1
                  }
                  title={t('Achivements')}
                  icon={'trophy'}
                  color={'#E81123'}
                  onPress={() => navigation.navigate('Achivements')}
                />
              </View>

              <View
                style={[
                  styles.moreItem,
                  {width: width > 600 ? '15%' : width / 2 - 40},
                  (isGamepadActive || Platform.isTV) &&
                    focusedSection === 'more' &&
                    focusedIndex === 2 && {zIndex: 99, overflow: 'visible'},
                ]}>
                <HomeItem
                  isFocused={
                    (isGamepadActive || Platform.isTV) &&
                    focusedSection === 'more' &&
                    focusedIndex === 2
                  }
                  title={t('Settings')}
                  icon={'cog-outline'}
                  color={'#0078D7'}
                  onPress={() => navigation.navigate('Settings')}
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }
  };

  return (
    <View
      style={styles.root}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      {renderLoadingOverlay()}

      {showUsbWarnModal && renderUsbWarningModal()}

      {showHarmonyModal && renderHarmonyModal()}

      {renderContent()}

      {sessionReport && (
        <SessionReportModal
          visible={true}
          report={sessionReport}
          onDismiss={handleDismissReport}
          onDone={handleDoneReport}
        />
      )}

      <GamepadFooterHints
        visible={isGamepadActive || Platform.isTV}
        hints={gamepadHints}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingTop: 40,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  loginCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
  },
  loginButton: {
    minWidth: 200,
    borderRadius: 8,
  },
  spinnerTextStyle: {
    color: '#107C10',
    textAlign: 'center',
  },
  menuWrap: {
    width: 250,
  },
  noConsoles: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 20,
  },
  emptyConsoleCard: {
    borderRadius: 18,
    padding: 20,
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
  emptyConsoleCardDark: {
    backgroundColor: 'rgba(18, 20, 32, 0.84)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowOpacity: 0.32,
  },
  emptyConsoleHeader: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 124, 16, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 124, 16, 0.5)',
  },
  emptyConsoleMark: {
    color: '#8BC34A',
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 18,
  },
  emptyConsoleTitle: {
    marginBottom: 8,
  },
  emptyConsoleDesc: {
    opacity: 0.88,
    lineHeight: 20,
    marginBottom: 14,
  },
  emptyConsoleActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  emptyActionBtn: {
    marginRight: 10,
  },
  actionButtonFocused: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 8,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.6,
  },
  consoleList: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
  },
  consoleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  nonModalLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  nonModalLoadingText: {
    color: '#107C10',
    marginTop: 12,
    fontSize: 16,
  },
  listContainer: {},
  consoleItem: {
    padding: 10,
  },
  listItemH: {
    width: '25%',
    justifyContent: 'center',
  },
  listItemV: {
    width: '50%',
    justifyContent: 'center',
  },
  blockTitle: {
    paddingLeft: 20,
    paddingRight: 10,
    paddingBottom: 10,
    marginBottom: 10,
  },
  blockTitleText: {
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, .1)',
  },
  moreItems: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  moreItem: {
    width: '15%',
    marginRight: 20,
    marginBottom: 10,
  },
  mt10: {
    marginTop: 10,
  },
});

export default HomeScreen;
