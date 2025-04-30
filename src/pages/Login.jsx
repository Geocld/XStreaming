import React from 'react';
import {WebView} from 'react-native-webview';
import Spinner from 'react-native-loading-spinner-overlay';
import {debugFactory} from '../utils/debug';

const log = debugFactory('LoginScreen');

function DetailScreen({navigation, route}) {
  const [authUrl, setAuthUrl] = React.useState('');

  React.useEffect(() => {
    if (route.params?.authUrl) {
      log.info('Receive authUrl:', route.params?.authUrl);
      setAuthUrl(route.params?.authUrl);
    }
  }, [route.params?.authUrl]);

  if (authUrl !== '') {
    return (
      <WebView
        source={{uri: authUrl}}
        originWhitelist={['*']}
        startInLoadingState={true}
        renderLoading={() => (
          <Spinner visible={true} cancelable={true} color={'#107C10'} />
        )}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={request => {
          // log.info('onShouldStartLoadWithRequest:', request);
          if (request.url.startsWith('ms-xal-000000004c20a908:')) {
            return false;
          }
          return true;
        }}
        onNavigationStateChange={navState => {
          // Keep track of going back navigation within component
          // log.info('onNavigationStateChange:', navState);
          const {url} = navState;
          if (url.startsWith('ms-xal-000000004c20a908:')) {
            // Save url，return to home
            navigation.navigate({
              name: 'Home',
              params: {xalUrl: url},
              merge: true,
            });
          }
        }}
      />
    );
  } else {
    return null;
  }
}

export default DetailScreen;
