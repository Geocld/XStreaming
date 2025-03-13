import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  FlatList,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import {Text, FAB, Portal, Modal, Card} from 'react-native-paper';
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

function HomeScreen({navigation, route}) {
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [xalUrl, setXalUrl] = React.useState('');
  const [profile, setProfile] = React.useState(null);
  const [consoles, setConsoles] = React.useState([]);
  const [isConnected, setIsConnected] = React.useState(true);
  const [currentConsoleId, setCurrentConsoleId] = React.useState('');
  const [numColumns, setNumColumns] = React.useState(2);
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

  // React.useEffect(() => {
  //   log.info('Page loaded.');
  //   SplashScreen.hide();
  // });

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
    }

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
          log.info('Current authentication state:', _authentication.current); // 添加这行
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
      } else {
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
                  Alert.alert(
                    t('Warning'),
                    t(
                      'Login has expired or not logged in, please log in again',
                    ),
                    [
                      {
                        text: t('Confirm'),
                        style: 'default',
                        onPress: () => {
                          navigation.navigate('Login', {
                            authUrl: redirectObj.sisuAuth.MsaOauthRedirect,
                          });
                        },
                      },
                    ],
                  );
                });
            }
          })
          .catch(e => {
            Alert.alert(t('Error'), e);
          });
      }

      return () => {
        unsubscribe();
      };
    }

    return () => {
      subscription?.remove();
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

  const handleStartStream = async sessionId => {
    setCurrentConsoleId(sessionId);
    handleNavigateStream(sessionId);
  };

  const handleNavigateStream = async sessionId => {
    const settings = getSettings();

    navigation.navigate({
      name: 'Stream',
      params: {
        sessionId,
        settings,
      },
    });
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
    if (!isLogined || loading) {
      return null;
    }
    if (consoles.length) {
      return (
        <View>
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
                      onPoweronStream={() => handlePoweronAndStream(item.id)}
                    />
                  </View>
                );
              }}
            />
          </View>
        </View>
      );
    } else {
      return (
        <View style={styles.noConsoles}>
          <Text variant="titleMedium">{t('NoConsoles')}</Text>
        </View>
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} renderToHardwareTextureAndroid>
      <View>
        <Spinner
          visible={loading}
          color={'#107C10'}
          textContent={loadingText}
          textStyle={styles.spinnerTextStyle}
        />

        {renderProfile()}

        {renderContent()}
      </View>
      {renderFab()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingTop: 20,
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
