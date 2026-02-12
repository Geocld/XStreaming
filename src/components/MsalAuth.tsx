import React from 'react';
import {StyleSheet, View, ToastAndroid} from 'react-native';
import {Text, Button} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import RNRestart from 'react-native-restart';
import LinkText from '../components/LinkText';
import Clipboard from '@react-native-clipboard/clipboard';

type MsalData = {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

type Props = {
  data: MsalData;
};

const formatSeconds = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const MsalAuth: React.FC<Props> = ({data}) => {
  const {t} = useTranslation();
  const [countdown, setCountdown] = React.useState(data.expires_in);

  React.useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  return (
    <View style={styles.container}>
      <QRCode value={data.verification_uri} size={200} color="#107C10" />

      <View style={[styles.mt10, styles.mb10]}>
        <LinkText url={data.verification_uri}>{data.verification_uri}</LinkText>
      </View>

      <Text variant="titleMedium" style={styles.center}>
        {t('MsalAuthTip')}
      </Text>

      {countdown > 0 && (
        <Button
          style={styles.mt10}
          mode="text"
          onPress={() => {
            Clipboard.setString(data.user_code);
            ToastAndroid.show(t('Copied'), ToastAndroid.SHORT);
          }}>
          {data.user_code}
        </Button>
      )}

      {countdown > 0 ? (
        <Text variant="labelSmall">{formatSeconds(countdown)}</Text>
      ) : (
        <View>
          <Text variant="labelSmall" style={styles.red}>
            {t('MsalAuthTimeout')}
          </Text>
          <Button
            style={styles.mt10}
            mode="text"
            onPress={() => RNRestart.restart()}>
            &nbsp;{t('Refresh')}&nbsp;
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  red: {
    color: 'red',
  },
  mt10: {
    marginTop: 10,
  },
  mb10: {
    marginBottom: 10,
  },
});

export default MsalAuth;
