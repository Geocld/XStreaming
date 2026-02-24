import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  Dimensions,
  SafeAreaView,
  NativeModules,
  ToastAndroid,
  Linking,
} from 'react-native';
import {Button, Text, Portal, Modal, Card} from 'react-native-paper';
import Spinner from '../components/Spinner';
import {useIsFocused} from '@react-navigation/native';
import RNRestart from 'react-native-restart';
import ConsoleItem from '../components/ConsoleItem';
import HomeItem from '../components/HomeItem';
import {getSettings, saveSettings} from '../store/settingStore';

import Authentication from '../Authentication';
import MsalAuthentication from '../MsalAuthentication';
import WebApi from '../web';

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

const log = debugFactory('HomeScreen');

const {UsbRumbleManager, FullScreenManager} = NativeModules;

const HARMOBY_URL =
  'https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh';

const MSAL = 'msal';

function HomeScreen({navigation, route}) {
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [xalUrl, setXalUrl] = React.useState('');
  const [consoles, setConsoles] = React.useState([]);
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

  const {width} = Dimensions.get('window');

  React.useEffect(() => {
    log.info('Page loaded.');
    SplashScreen.hide();

    const _settings = getSettings();
    const webviewVersion = FullScreenManager.getWebViewVersion();
    const deviceInfos = FullScreenManager.getDeviceInfos();
    if (webviewVersion) {
      const verArr = webviewVersion.split('.');
      const mainVer = verArr[0];
      if (deviceInfos.androidVer < 12 && mainVer < 91) {
        _settings.render_engine = 'native';
        saveSettings(_settings);
      }
    }

    // HarmonyOS modal
    if (
      deviceInfos &&
      deviceInfos.factor.indexOf('HUAWEI') > -1 &&
      _settings.locale === 'zh' &&
      _settings.show_harmony_modal
    ) {
      setShowHarmonyModal(true);
    }

    const updateLayout = () => {
      const {width: w, height: h} = Dimensions.get('window');
      setNumColumns(w > h ? 4 : 2);
    };

    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);

    const unsubscribe = NetInfo.addEventListener((state: any) => {
      setIsConnected(state.isConnected);
    });

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
    } else {
      // Auth completed callback
      const authenticationCompleted = async (_streamingTokens, _webToken) => {
        log.info('Authentication completed');
        webTokenRef.current = _webToken;
        // log.info('AuthenticationCompleted streamingTokens:', streamingTokens);
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

        setLoading(true);
        const webApi = new WebApi(_webToken);

        try {
          setLoadingText(t('Fetching consoles...'));

          const _xHomeApi = new XcloudApi(
            _streamingTokens.xHomeToken.getDefaultRegion().baseUri,
            _streamingTokens.xHomeToken.data.gsToken,
            'home',
            () => {},
          );
          _xHomeApiRef.current = _xHomeApi;

          const cacheData = getConsolesData();

          if (
            cacheData &&
            isConsolesDataValid(cacheData) &&
            cacheData.consoles
          ) {
            setConsoles(cacheData.consoles);
            setLoading(false);
          }

          let _consoles: any = await _xHomeApi.getConsoles();

          if (!_consoles.length) {
            _consoles = await webApi.getConsoles();
          }

          if (_consoles.length > 0) {
            setConsoles(_consoles);
            saveConsolesData({
              consoles: _consoles,
            });
          }
        } catch (e) {
          Alert.alert(t('Error'), e);
        }
        setLoading(false);
      };

      // Auth failed callback
      const authenticationFailed = (msg, rollback = false) => {
        if (rollback) {
          // Rollback to MSAL auth
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
                // Restart application to relogin
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

      if (_isFocused.current) {
        log.info('HomeScreen isFocused:', _isFocused.current);

        // Return from Login screen(XAL auth)
        if (route.params?.xalUrl) {
          if (!_isLogined.current) {
            log.info('HomeScreen receive xalUrl:', route.params?.xalUrl);
            setXalUrl(route.params.xalUrl);
            setLoading(true);
            setLoadingText(
              t('Login successful, refreshing login credentials...'),
            );
            _authentication.current.startAuthflow(
              _redirect.current,
              route.params.xalUrl,
            );
          }
        } else if (route.params?.needRefresh && webTokenRef.current) {
          if (!_xHomeApiRef.current) {
            return;
          }
          // Refresh silently
          // setLoading(true);
          // setLoadingText(t('Fetching consoles...'));

          const webApi = new WebApi(webTokenRef.current);
          _xHomeApiRef.current.getConsoles().then(_consoles => {
            if (!_consoles.length) {
              webApi.getConsoles().then((_consolesV1: any) => {
                if (_consolesV1.length) {
                  setConsoles(_consolesV1);
                }
              });
            } else {
              setConsoles(_consoles);
            }
          });
        } else if (!_isLogined.current) {
          setLoading(true);
          setLoadingText(t('Checking login status...'));
          _authentication.current
            .checkAuthentication()
            .then(isAuth => {
              if (!isAuth) {
                if (_settings.use_msal_login) {
                  setLoading(false);
                  setShowLogin(false);
                  setShowMsalLogin(true);
                  setShowMsal(false);
                } else {
                  _authentication.current._xal
                    .getRedirectUri()
                    .then(redirectObj => {
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
            .catch(e => {
              Alert.alert(t('Error'), e);
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
    }

    return () => {
      subscription?.remove();
      unsubscribe();
    };
  }, [
    t,
    route.params?.xalUrl,
    route.params?.needRefresh,
    dispatch,
    navigation,
    isConnected,
  ]);

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
      routeName = 'NativeStream';
    }

    // Lagecy user force to native stream
    if (isLagecy) {
      routeName = 'NativeStream';
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
                mode="text"
                onPress={() => {
                  let _settings = getSettings();
                  _settings.show_harmony_modal = false;
                  saveSettings(_settings);
                  setShowHarmonyModal(false);
                }}>
                不再提示
              </Button>
              <Button
                mode="elevated"
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
    navigation.navigate('Login', {
      authUrl: _redirect.current.sisuAuth.MsaOauthRedirect,
    });
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
    return (
      <View>
        <Text style={styles.title}>{t('NoLogin')}</Text>
        <Button mode="outlined" onPress={handleLogin}>
          &nbsp;{t('Login')}&nbsp;
        </Button>

        <Button
          style={styles.mt10}
          mode="text"
          onPress={() => navigation.navigate('Settings')}>
          &nbsp;{t('Settings')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderMsalLogin = () => {
    return (
      <View>
        <Button
          mode="outlined"
          loading={msalBtnLoading}
          onPress={handleMsalLogin}>
          &nbsp;{t('AuthLogin')}&nbsp;
        </Button>

        <Button
          style={styles.mt10}
          mode="text"
          onPress={() => navigation.navigate('Settings')}>
          &nbsp;{t('Settings')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return null;
    }
    if (showLogin) {
      return <View style={styles.centerContainer}>{renderLogin()}</View>;
    } else if (showMsalLogin) {
      return <View style={styles.centerContainer}>{renderMsalLogin()}</View>;
    } else if (showMsal) {
      return (
        <View style={styles.centerContainer}>
          <MsalAuth data={msalData} />
        </View>
      );
    } else {
      return (
        <SafeAreaView style={styles.container}>
          <ScrollView>
            <View style={[styles.blockTitle]}>
              <Text variant="titleLarge" style={styles.blockTitleText}>
                {t('Consoles')}
              </Text>
            </View>

            {consoles.length > 0 ? (
              <View style={styles.consoleList}>
                <FlatList
                  data={consoles}
                  numColumns={numColumns}
                  key={numColumns}
                  contentContainerStyle={styles.listContainer}
                  scrollEnabled={false}
                  renderItem={({item}: any) => {
                    return (
                      <View
                        style={[
                          styles.consoleItem,
                          numColumns === 4
                            ? styles.listItemH
                            : styles.listItemV,
                        ]}>
                        <ConsoleItem
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
                  }}
                />
              </View>
            ) : (
              <View style={styles.noConsoles}>
                <Text variant="titleMedium">{t('NoConsoles')}</Text>
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
                ]}>
                <HomeItem
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
                ]}>
                <HomeItem
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
                ]}>
                <HomeItem
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
    <>
      <Spinner loading={loading} text={loadingText} />

      {renderUsbWarningModal()}

      {renderHarmonyModal()}

      {renderContent()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
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
  consoleList: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 10,
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
