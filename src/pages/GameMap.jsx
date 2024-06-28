import React from 'react';
import {WebView} from 'react-native-webview';
import {getSettings, saveSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';

const log = debugFactory('GameMapScreen');

function GameMap({navigation, route}) {
  const [settings, setSettings] = React.useState({});
  const [show, setShow] = React.useState(false);

  const uri = 'file:///android_asset/stream/index.html#/map';

  React.useEffect(() => {
    log.info('Gamemap screen show');

    const _settings = getSettings();
    log.info('Get localSettings:', _settings);
    setSettings(_settings);
    setShow(true);
  }, [navigation]);

  const handleWebviewMessage = event => {
    const data = JSON.parse(event.nativeEvent.data);
    const {type, message} = data;
    if (type === 'saveMaping') {
      settings.gamepad_maping = message;
      saveSettings(settings);
    }
  };

  return (
    <>
      {show && (
        <WebView
          source={{uri}}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          injectedJavaScriptObject={{
            settings,
          }}
          onMessage={event => {
            handleWebviewMessage(event);
          }}
        />
      )}
    </>
  );
}

export default GameMap;
