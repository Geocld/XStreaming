import React from 'react';
import {WebView} from 'react-native-webview';
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
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={request => {
          // log.info('onShouldStartLoadWithRequest:', request);
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
          // Keep track of going back navigation within component
          // log.info('onNavigationStateChange:', navState);
          const {url} = navState;
          // log.info('Navigation URL:', url); // 添加这行日志
          if (url.startsWith('ms-xal-000000004c20a908:')) {
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
