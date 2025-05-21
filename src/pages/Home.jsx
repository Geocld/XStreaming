import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  FlatList,
  Dimensions,
  SafeAreaView,
  NativeModules,
} from 'react-native';
import {Button, Text, FAB, Portal, Modal, Card} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import {useIsFocused} from '@react-navigation/native';
import ConsoleItem from '../components/ConsoleItem';
import Profile from '../components/Profile';
import {getSettings} from '../store/settingStore';

import Authentication from '../Authentication';
import WebApi from '../web';

import {useSelector, useDispatch} from 'react-redux';
import SplashScreen from 'react-native-splash-screen';
import {useTranslation} from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import {debugFactory} from '../utils/debug';

const log = debugFactory('HomeScreen');

const {UsbRumbleManager} = NativeModules;

function HomeScreen({navigation, route}) {
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [xalUrl, setXalUrl] = React.useState('');
  const [profile, setProfile] = React.useState(null);
  const [consoles, setConsoles] = React.useState([]);
  const [isConnected, setIsConnected] = React.useState(true);
  const [currentConsoleId, setCurrentConsoleId] = React.useState('');
  const [showUsbWarnModal, setShowUsbWarnShowModal] = React.useState(false);
  const [numColumns, setNumColumns] = React.useState(2);
  const [showLogin, setShowLogin] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);

  const authentication = useSelector(state => state.authentication);
  const _authentication = React.useRef(authentication);

  const redirect = useSelector(state => state.redirect);
  const _redirect = React.useRef(redirect);

  const isLogined = useSelector(state => state.isLogined);
  const _isLogined = React.useRef(isLogined);

  const webToken = useSelector(state => state.webToken);
  const webTokenRef = React.useRef(null);

  const dispatch = useDispatch();

  const isFocused = useIsFocused();
  const _isFocused = React.useRef(isFocused);

  const [fabOpen, setFabOpen] = React.useState(false);

  React.useEffect(() => {
    log.info('Page loaded.');
    SplashScreen.hide();

    const updateLayout = () => {
      const {width, height} = Dimensions.get('window');
      setNumColumns(width > height ? 4 : 2);
    };

    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);

    const unsubscribe = NetInfo.addEventListener(state => {
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
      if (!_authentication.current) {
        log.info('Authentication initial.');
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

          setLoading(true);
          const webApi = new WebApi(_webToken);

          setLoadingText(t('Fetching user info...'));
          try {
            const _profile = await webApi.getUserProfile();
            setProfile(_profile);
            dispatch({
              type: 'SET_PROFILE',
              payload: _profile,
            });
            setLoadingText(t('Fetching consoles...'));
            const _consoles = await webApi.getConsoles();
            setConsoles(_consoles);
          } catch (e) {
            Alert.alert(t('Error'), e);
          }
          setLoading(false);
        };

        _authentication.current = new Authentication(authenticationCompleted);
        dispatch({
          type: 'SET_AUTHENTICATION',
          payload: _authentication.current,
        });
      }

      if (_isFocused.current) {
        log.info('HomeScreen isFocused:', _isFocused.current);

        // Return from Login screen
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
          setLoading(true);
          setLoadingText(t('Fetching consoles...'));
          const webApi = new WebApi(webTokenRef.current);
          webApi.getConsoles().then(_consoles => {
            setConsoles(_consoles);
            setLoading(false);
          });
        } else if (!_isLogined.current) {
          setLoading(true);
          setLoadingText(t('Checking login status...'));
          _authentication.current
            .checkAuthentication()
            .then(isAuth => {
              dispatch({
                type: 'SET_AUTHENTICATION',
                payload: _authentication.current,
              });
              if (!isAuth) {
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
                  });
              }
            })
            .catch(e => {
              Alert.alert(t('Error'), e);
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

      const _consoles = await webApi.getConsoles();
      setConsoles(_consoles);

      setLoading(false);

      handleStartStream(sessionId);
    } catch (e) {
      setLoading(false);

      handleStartStream(sessionId);
    }
  };

  const handleStartStream = async (sessionId, isNative = false) => {
    const settings = getSettings();
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    setCurrentConsoleId(sessionId);
    if (isUsbMode) {
      setShowUsbWarnShowModal(true);
    } else {
      handleNavigateStream(sessionId, isNative);
    }
  };

  const handleNavigateStream = async (sessionId, isNative = false) => {
    const settings = getSettings();
    const hasValidUsbDevice = await UsbRumbleManager.getHasValidUsbDevice();
    const usbController = await UsbRumbleManager.getUsbController();
    const isUsbMode = settings.bind_usb_device && hasValidUsbDevice;

    navigation.navigate({
      name: isNative ? 'NativeStream' : 'Stream',
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

  const handleLogin = () => {
    navigation.navigate('Login', {
      authUrl: _redirect.current.sisuAuth.MsaOauthRedirect,
    });
  };

  const renderLogin = () => {
    return (
      <View>
        <Text style={styles.title}>{t('NoLogin')}</Text>
        <Button mode="outlined" onPress={handleLogin}>
          &nbsp;{t('Login')}&nbsp;
        </Button>
      </View>
    );
  };

  const renderProfile = () => {
    if (!showProfile || !profile) {
      return null;
    }
    return (
      <Portal>
        <Modal
          visible={showProfile}
          onDismiss={() => {
            setShowProfile(false);
          }}
          contentContainerStyle={{marginLeft: '10%', marginRight: '10%'}}>
          <Card>
            <Card.Content>
              <Profile profile={profile} />
            </Card.Content>
          </Card>
        </Modal>
      </Portal>
    );
  };

  const renderFab = () => {
    const fabActions = [
      {
        icon: 'information',
        label: t('Profile'),
        onPress: () => {
          setFabOpen(false);
          setShowProfile(true);
        },
      },
      {
        icon: 'account-supervisor',
        label: t('Friends'),
        onPress: () => navigation.navigate('Friends'),
      },
      {
        icon: 'trophy',
        label: t('Achivements'),
        onPress: () => navigation.navigate('Achivements'),
      },
    ];

    if (!isLogined) {
      return null;
    }

    return (
      <FAB.Group
        open={fabOpen}
        visible
        icon={fabOpen ? 'account-circle' : 'account-circle-outline'}
        actions={fabActions}
        onStateChange={({open}) => setFabOpen(open)}
      />
    );
  };

  const renderContent = () => {
    if (loading) {
      return null;
    }
    if (showLogin) {
      return <View style={styles.centerContainer}>{renderLogin()}</View>;
    } else if (consoles.length) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.consoleList}>
            <FlatList
              data={consoles}
              numColumns={numColumns}
              key={numColumns}
              contentContainerStyle={styles.listContainer}
              renderItem={({item}) => {
                return (
                  <View
                    style={[
                      styles.consoleItem,
                      numColumns === 4 ? styles.listItemH : styles.listItemV,
                    ]}>
                    <ConsoleItem
                      consoleItem={item}
                      onPress={() => handleStartStream(item.id)}
                      onPress2={() => handleStartStream(item.id, true)}
                      onPoweronStream={() => handlePoweronAndStream(item.id)}
                    />
                  </View>
                );
              }}
            />
          </View>
        </SafeAreaView>
      );
    } else {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.noConsoles}>
            <Text variant="titleMedium">{t('NoConsoles')}</Text>
          </View>
        </SafeAreaView>
      );
    }
  };

  return (
    <>
      <Spinner
        visible={loading}
        color={'#107C10'}
        textContent={loadingText}
        textStyle={styles.spinnerTextStyle}
      />

      {renderUsbWarningModal()}

      {renderProfile()}

      {renderContent()}

      {renderFab()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    padding: 20,
  },
  consoleList: {
    paddingTop: 40,
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
});

export default HomeScreen;
