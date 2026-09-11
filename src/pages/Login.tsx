import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  NativeModules,
  StyleSheet,
  View,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {useTheme} from 'react-native-paper';
import {debugFactory} from '../utils/debug';
import {useGamepadNavigation} from '../utils/useGamepadNavigation';

const {GamepadManager} = NativeModules;
const log = debugFactory('LoginScreen');

const INJECTED_JAVASCRIPT = `
(function() {
  function tryAutoFocus() {
    try {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        return;
      }
      var input = document.querySelector('input[type="email"], input[name="loginfmt"], input[type="password"], input[name="passwd"], input[type="text"]');
      if (input) {
        input.focus();
      }
    } catch(e) {}
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(tryAutoFocus, 300);
  } else {
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(tryAutoFocus, 300);
    });
  }

  var observer = new MutationObserver(function() {
    tryAutoFocus();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
true;
`;

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

function DetailScreen({navigation, route}: any) {
  const theme = useTheme();
  const [authUrl, setAuthUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    GamepadManager?.setCurrentScreen?.('login');
    return () => {
      GamepadManager?.setCurrentScreen?.('');
    };
  }, []);

  const handleBack = useCallback(() => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    } else {
      navigation.goBack();
    }
  }, [canGoBack, navigation]);

  useGamepadNavigation({
    onBack: handleBack,
  });

  useEffect(() => {
    if (route.params?.authUrl) {
      log.info('Receive authUrl:', route.params?.authUrl);
      setAuthUrl(route.params?.authUrl);
    }
  }, [route.params?.authUrl]);

  const renderLoading = useCallback(
    () => (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    ),
    [theme.colors.primary],
  );

  if (authUrl !== '') {
    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{uri: authUrl}}
          originWhitelist={['*']}
          startInLoadingState={true}
          renderLoading={renderLoading}
          style={styles.webView}
          containerStyle={styles.container}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          keyboardDisplayRequiresUserAction={false}
          setSupportMultipleWindows={false}
          allowFileAccess={true}
          scalesPageToFit={true}
          mixedContentMode="always"
          cacheEnabled={true}
          injectedJavaScript={INJECTED_JAVASCRIPT}
          userAgent={USER_AGENT}
          onLoadEnd={() => {
            webViewRef.current?.requestFocus?.();
          }}
          onShouldStartLoadWithRequest={request => {
            if (request.url.startsWith('ms-xal-000000004c20a908:')) {
              navigation.navigate({
                name: 'Home',
                params: {xalUrl: request.url},
                merge: true,
              });
              return false;
            }
            return true;
          }}
          onNavigationStateChange={navState => {
            setCanGoBack(navState.canGoBack);
            const {url} = navState;
            if (url.startsWith('ms-xal-000000004c20a908:')) {
              navigation.navigate({
                name: 'Home',
                params: {xalUrl: url},
                merge: true,
              });
            }
          }}
        />
      </View>
    );
  } else {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
});

export default DetailScreen;
