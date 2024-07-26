import React from 'react';
import {
  StyleSheet,
  View,
  Alert,
  SafeAreaView,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {Text, Divider} from '@ui-kitten/components';
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
import LinkModeModal from '../components/LinkModeModal';

const log = debugFactory('HomeScreen');

function HomeScreen({navigation, route}) {
  const {t} = useTranslation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadingText, setLoadingText] = React.useState('');
  const [xalUrl, setXalUrl] = React.useState('');
  const [profile, setProfile] = React.useState(null);
  const [consoles, setConsoles] = React.useState([]);
  const [isConnected, setIsConnected] = React.useState(true);
  const [showLinkMode, setShowLinkMode] = React.useState(false);

  const authentication = useSelector(state => state.authentication);
  const _authentication = React.useRef(authentication);

  const redirect = useSelector(state => state.redirect);
  const _redirect = React.useRef(redirect);

  const isLogined = useSelector(state => state.isLogined);
  const _isLogined = React.useRef(isLogined);

  const webToken = useSelector(state => state.webToken);

  const dispatch = useDispatch();

  const isFocused = useIsFocused();
  const _isFocused = React.useRef(isFocused);

  React.useEffect(() => {
    log.info('Page loaded.');
    SplashScreen.hide();

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
        const _profile = await webApi.getUserProfile();
        setProfile(_profile);
        dispatch({
          type: 'SET_PROFILE',
          payload: _profile,
        });
        setLoadingText(t('Fetching consoles...'));
        const _consoles = await webApi.getConsoles();
        setConsoles(_consoles);
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
      } else {
        setLoading(true);
        setLoadingText(t('Checking login status...'));
        _authentication.current.checkAuthentication().then(isAuth => {
          dispatch({
            type: 'SET_AUTHENTICATION',
            payload: _authentication.current,
          });
          if (!isAuth) {
            _authentication.current._xal.getRedirectUri().then(redirectObj => {
              setLoading(false);
              log.info('Redirect:', redirectObj);
              _redirect.current = redirectObj;
              dispatch({
                type: 'SET_REDIRECT',
                payload: redirectObj,
              });
              Alert.alert(
                t('Warning'),
                t('Login has expired or not logged in, please log in again'),
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
        });
      }

      return () => {
        unsubscribe();
      };
    }
  }, [t, route.params?.xalUrl, dispatch, navigation, isConnected]);

  const handleStartStream = sessionId => {
    const settings = getSettings();
    navigation.navigate({
      name: 'Stream',
      params: {
        sessionId,
        settings,
      },
    });
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const webApi = new WebApi(webToken);
    const _consoles = await webApi.getConsoles();
    setConsoles(_consoles);
    setRefreshing(false);
  }, [webToken]);

  return (
    <SafeAreaView style={styles.container} renderToHardwareTextureAndroid>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        <Spinner
          visible={loading}
          color={'#107C10'}
          textContent={loadingText}
          textStyle={styles.spinnerTextStyle}
        />

        <LinkModeModal
          show={showLinkMode}
          onConfirm={handleStartStream}
          onClose={() => setShowLinkMode(false)}
        />

        {profile && <Profile profile={profile} />}

        {consoles.length > 0 ? (
          <View>
            <Text style={styles.title} category="h6">
              {t('Consoles')}
            </Text>
            <Divider />
            <View style={styles.consoleList}>
              {consoles.map(console => {
                return (
                  <ConsoleItem
                    consoleItem={console}
                    key={console.id}
                    onPress={() => {
                      handleStartStream(console.id);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  spinnerTextStyle: {
    color: '#107C10',
  },
  menuWrap: {
    width: 250,
  },
  title: {
    paddingBottom: 10,
  },
  consoleList: {
    marginTop: 20,
  },
});

export default HomeScreen;
