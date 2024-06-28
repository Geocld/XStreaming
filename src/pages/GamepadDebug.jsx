import React from 'react';
import {WebView} from 'react-native-webview';

function GameMap({navigation, route}) {
  const uri = 'file:///android_asset/stream/index.html#/debug';

  return (
    <>
      <WebView
        source={{uri}}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
      />
    </>
  );
}

export default GameMap;
