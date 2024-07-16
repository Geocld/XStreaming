import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Alert,
  NativeModules,
  Vibration,
  NativeEventEmitter,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import XcloudApi from '../xCloud';
import {useSelector} from 'react-redux';
import {getSettings} from '../store/settingStore';
import Spinner from 'react-native-loading-spinner-overlay';
import {useTranslation} from 'react-i18next';
import {RTCView, MediaStream} from 'react-native-webrtc';
import webRTCClient from '../webrtc';
import {debugFactory} from '../utils/debug';
import {GAMEPAD_MAPING} from '../common';

const log = debugFactory('NewStreamScreen');

const {FullScreenManager, GamepadManager} = NativeModules;

const defaultMaping = GAMEPAD_MAPING;

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

function NewStreamScreen({navigation, route}) {
  const {t} = useTranslation();
  const authentication = useSelector(state => state.authentication);
  const streamingTokens = useSelector(state => state.streamingTokens);

  const [xHomeApi, setXHomeApi] = React.useState(null);
  const [xCloudApi, setXCloudApi] = React.useState(null);
  const [settings, setSettings] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [loadingText, setLoadingText] = React.useState('');

  const [webrtcClient, setWebrtcClient] = React.useState(undefined);
  const [remote, setRemote] = React.useState(null);
  const remoteStream = React.useRef(null);

  React.useEffect(() => {
    const _settings = getSettings();
    setSettings(_settings);

    const sweap = obj => {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [value, key]),
      );
    };

    let gpMaping = sweap(defaultMaping);
    if (_settings.native_gamepad_maping) {
      gpMaping = sweap(_settings.native_gamepad_maping);
    }

    FullScreenManager.immersiveModeOn();
    Orientation.lockToLandscape();

    let gpDownEventListener;
    let gpUpEventListener;
    let dpDownEventListener;
    let dpUpEventListener;
    let leftStickEventListener;
    let rightStickEventListener;
    let triggerEventListener;
    let timer;

    if (!xHomeApi) {
      if (streamingTokens.xHomeToken) {
        const _xHomeApi = new XcloudApi(
          streamingTokens.xHomeToken.getDefaultRegion().baseUri,
          streamingTokens.xHomeToken.data.gsToken,
          'home',
          authentication,
        );
        setXHomeApi(_xHomeApi);
      }
    }

    if (xHomeApi && webrtcClient === undefined) {
      setWebrtcClient(new webRTCClient());
    }

    if (xHomeApi && webrtcClient !== undefined) {
      webrtcClient.init();

      remoteStream.current = new MediaStream(undefined);

      webrtcClient.setTrackHandler(event => {
        console.log('client.current.ontrack', event);
        const track = event.track;
        if (!remoteStream.current) {
          remoteStream.current = new MediaStream();
        }
        remoteStream.current.addTrack(track, remoteStream.current);
      });

      webrtcClient.setConnectedHandler(() => {
        // Connected
        setLoadingText(`${t('Connected')}`);
        setLoading(false);
        setRemote(remoteStream.current.toURL());
      });

      const eventEmitter = new NativeEventEmitter();

      gpDownEventListener = eventEmitter.addListener(
        'onGamepadKeyDown',
        event => {
          const keyCode = event.keyCode;
          gpState[gpMaping[keyCode]] = 1;
        },
      );

      gpUpEventListener = eventEmitter.addListener('onGamepadKeyUp', event => {
        const keyCode = event.keyCode;
        gpState[gpMaping[keyCode]] = 0;
      });

      dpDownEventListener = eventEmitter.addListener('onDpadKeyDown', event => {
        const keyCode = event.dpadIdx;
        gpState[gpMaping[keyCode]] = 1;
      });

      dpUpEventListener = eventEmitter.addListener('onDpadKeyUp', event => {
        const _gpMaping = _settings.native_gamepad_maping ?? defaultMaping;
        gpState[gpMaping[_gpMaping.DPadUp]] = 0;
        gpState[gpMaping[_gpMaping.DPadDown]] = 0;
        gpState[gpMaping[_gpMaping.DPadLeft]] = 0;
        gpState[gpMaping[_gpMaping.DPadRight]] = 0;
      });

      leftStickEventListener = eventEmitter.addListener(
        'onLeftStickMove',
        event => {
          console.log('onLeftStickMove:', event);
          gpState.LeftThumbXAxis = event.axisX;
          gpState.LeftThumbYAxis = event.axisY;
        },
      );

      rightStickEventListener = eventEmitter.addListener(
        'onRightStickMove',
        event => {
          gpState.RightThumbXAxis = event.axisX;
          gpState.RightThumbYAxis = event.axisY;
        },
      );

      triggerEventListener = eventEmitter.addListener('onTrigger', event => {
        gpState.LeftTrigger = event.leftTrigger;
        gpState.RightTrigger = event.rightTrigger;
      });

      timer = setInterval(() => {
        webrtcClient.setGamepadState(gpState);
      }, 1000 / 120);

      const streamApi = xHomeApi;

      setLoadingText(`${t('Connecting...')}`);

      streamApi
        .startSession(route.params?.sessionId, _settings.resolution)
        .then(configuration => {
          setLoadingText(
            `${t('Configuration obtained successfully, initiating offer...')}`,
          );
          webrtcClient.createOffer().then(offer => {
            console.log('offer:', offer);
            streamApi.sendSDPOffer(offer).then(sdpResponse => {
              setLoadingText(`${t('Remote offer retrieved successfully...')}`);
              log.info('sdpResponse.exchangeResponse:', sdpResponse);
              const sdpDetails = JSON.parse(sdpResponse.exchangeResponse);
              webrtcClient.setRemoteOffer(sdpDetails.sdp).then(() => {
                setLoadingText(`${t('Ready to send ICE...')}`);
                const iceCandidates = webrtcClient.getIceCandidates();
                streamApi.sendICECandidates(iceCandidates).then(iceDetails => {
                  log.info(
                    'Client - ICE iceDetails:',
                    JSON.stringify(iceDetails),
                  );
                  webrtcClient.setIceCandidates(iceDetails);
                  setLoadingText(`${t('Exchange ICE successfully...')}`);
                });
              });
            });
          });
        });
    }

    return () => {
      Orientation.unlockAllOrientations();
      FullScreenManager.immersiveModeOff();

      if (webrtcClient) {
        webrtcClient.close();
      }
      gpDownEventListener && gpDownEventListener.remove();
      gpUpEventListener && gpUpEventListener.remove();
      dpDownEventListener && dpDownEventListener.remove();
      dpUpEventListener && dpUpEventListener.remove();
      leftStickEventListener && leftStickEventListener.remove();
      rightStickEventListener && rightStickEventListener.remove();
      triggerEventListener && triggerEventListener.remove();
      timer && clearInterval(timer);
    };
  }, [
    t,
    route.params?.sessionId,
    webrtcClient,
    streamingTokens,
    navigation,
    authentication,
    xHomeApi,
  ]);

  return (
    <View style={styles.container}>
      <Spinner
        visible={loading}
        color={'#107C10'}
        textContent={loadingText}
        textStyle={styles.spinnerTextStyle}
      />
      {remoteStream.current?.toURL() && (
        <RTCView
          style={styles.player}
          zOrder={9}
          objectFit={'contain'}
          streamURL={remote}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  player: {
    flex: 1,
    width: '100%',
  },
  spinnerTextStyle: {
    color: '#107C10',
  },
});

export default NewStreamScreen;
