import React from 'react';
import {WebView} from 'react-native-webview';
import {getSettings, saveSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';

const log = debugFactory('GameMapScreen');

const gpState = {
  A: 0,
  B: 0,
  X: 0,
  Y: 0,
  LeftShoulder: 0,
  RightShoulder: 0,
  LeftTrigger: 0,
  RightTrigger: 0,
  View: 0,
  Menu: 0,
  LeftThumb: 0,
  RightThumb: 0,
  DPadUp: 0,
  DPadDown: 0,
  DPadLeft: 0,
  DPadRight: 0,
  Nexus: 0,

  LeftThumbXAxis: 0.0,
  LeftThumbYAxis: 0.0,
  RightThumbXAxis: 0.0,
  RightThumbYAxis: 0.0,
};

function GameMap({navigation, route}) {
  const webViewRef = React.useRef(null);
  const [settings, setSettings] = React.useState({});

  const uri = 'file:///android_asset/stream/index.html#/map';

  React.useEffect(() => {
    log.info('Gamemap screen show');

    setTimeout(() => {
      gpState.A = 1;
      gpState.B = 1;
      console.log('postMessage');
      webViewRef.current.postMessage(
        JSON.stringify({type: 'updateGlobalVariable', value: gpState}),
      );
    }, 10 * 1000);

    const _settings = getSettings();
    log.info('Get localSettings:', _settings);
    setSettings(_settings);
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
      <WebView
        ref={webViewRef}
        source={{uri}}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        injectedJavaScriptObject={{
          settings,
          gpState,
        }}
        onMessage={event => {
          handleWebviewMessage(event);
        }}
      />
    </>
  );
}

export default GameMap;
