import React from 'react';
import {StyleSheet, View, ToastAndroid, Platform} from 'react-native';
import {Text, Button, useTheme} from 'react-native-paper';
import {useTranslation} from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import RNRestart from 'react-native-restart';
import LinkText from '../components/LinkText';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  useGamepadNavigation,
  useGamepadActiveState,
} from '../utils/useGamepadNavigation';

type Props = {
  data: any;
  onCancel?: () => void;
};

const formatSeconds = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const MsalAuth: React.FC<Props> = ({data, onCancel}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [countdown, setCountdown] = React.useState(data.expires_in);
  const [msalBtnLoading, setMsalBtnLoading] = React.useState(false);
  const [isGamepadActive] = useGamepadActiveState();
  const [focusedBtn, setFocusedBtn] = React.useState<
    'copy' | 'action' | 'cancel'
  >('action');

  useGamepadNavigation({
    priority: 10,
    onUp: () => {
      setFocusedBtn(curr => {
        if (curr === 'cancel') return 'action';
        if (curr === 'action') return 'copy';
        return 'copy';
      });
    },
    onDown: () => {
      setFocusedBtn(curr => {
        if (curr === 'copy') return 'action';
        if (curr === 'action') return 'cancel';
        return 'cancel';
      });
    },
    onSelect: () => {
      if (focusedBtn === 'copy') {
        Clipboard.setString(data.user_code);
        ToastAndroid.show(t('Copied'), ToastAndroid.SHORT);
      } else if (focusedBtn === 'action') {
        if (countdown > 0) {
          setMsalBtnLoading(true);
        } else {
          RNRestart.restart();
        }
      } else {
        onCancel?.();
      }
    },
    onBack: () => {
      onCancel?.();
    },
  });

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
      <QRCode
        value={data.verification_uri}
        size={200}
        color={theme.colors.primary}
      />

      <View style={[styles.mt10, styles.mb10]}>
        <LinkText url={data.verification_uri}>{data.verification_uri}</LinkText>
      </View>

      <Text variant="titleMedium" style={styles.center}>
        {t('MsalAuthTip')}
      </Text>

      {countdown > 0 && (
        <Button
          style={[
            styles.mt10,
            styles.actionButton,
            (isGamepadActive || Platform.isTV) &&
              focusedBtn === 'copy' &&
              styles.tvButtonFocused,
          ]}
          mode={
            (isGamepadActive || Platform.isTV) && focusedBtn === 'copy'
              ? 'contained'
              : 'text'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) && focusedBtn === 'copy'
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) && focusedBtn === 'copy'
              ? '#FFFFFF'
              : undefined
          }
          onPress={() => {
            Clipboard.setString(data.user_code);
            ToastAndroid.show(t('Copied'), ToastAndroid.SHORT);
          }}>
          {data.user_code}
        </Button>
      )}

      {countdown > 0 ? (
        <View style={styles.actionWrap}>
          <Text variant="labelSmall" style={styles.center}>
            {formatSeconds(countdown)}
          </Text>
          <Button
            style={[
              styles.mt10,
              styles.actionButton,
              (isGamepadActive || Platform.isTV) &&
                focusedBtn === 'action' &&
                styles.tvButtonFocused,
            ]}
            mode={
              (isGamepadActive || Platform.isTV) && focusedBtn === 'action'
                ? 'contained'
                : 'outlined'
            }
            buttonColor={
              (isGamepadActive || Platform.isTV) && focusedBtn === 'action'
                ? theme.colors.primary
                : undefined
            }
            textColor={
              (isGamepadActive || Platform.isTV) && focusedBtn === 'action'
                ? '#FFFFFF'
                : undefined
            }
            loading={msalBtnLoading}
            onPress={() => setMsalBtnLoading(true)}>
            &nbsp;{t('Completed')}&nbsp;
          </Button>
        </View>
      ) : (
        <View style={styles.actionWrap}>
          <Text variant="labelSmall" style={styles.red}>
            {t('MsalAuthTimeout')}
          </Text>
          <Button
            style={[
              styles.mt10,
              styles.actionButton,
              (isGamepadActive || Platform.isTV) &&
                focusedBtn === 'action' &&
                styles.tvButtonFocused,
            ]}
            mode={
              (isGamepadActive || Platform.isTV) && focusedBtn === 'action'
                ? 'contained'
                : 'outlined'
            }
            buttonColor={
              (isGamepadActive || Platform.isTV) && focusedBtn === 'action'
                ? theme.colors.primary
                : undefined
            }
            textColor={
              (isGamepadActive || Platform.isTV) && focusedBtn === 'action'
                ? '#FFFFFF'
                : undefined
            }
            onPress={() => RNRestart.restart()}>
            &nbsp;{t('Refresh')}&nbsp;
          </Button>
        </View>
      )}

      {onCancel && (
        <Button
          style={[
            styles.mt10,
            styles.actionButton,
            (isGamepadActive || Platform.isTV) &&
              focusedBtn === 'cancel' &&
              styles.tvButtonFocused,
          ]}
          mode={
            (isGamepadActive || Platform.isTV) && focusedBtn === 'cancel'
              ? 'contained'
              : 'text'
          }
          buttonColor={
            (isGamepadActive || Platform.isTV) && focusedBtn === 'cancel'
              ? theme.colors.primary
              : undefined
          }
          textColor={
            (isGamepadActive || Platform.isTV) && focusedBtn === 'cancel'
              ? '#FFFFFF'
              : undefined
          }
          onPress={onCancel}>
          &nbsp;{t('Cancel')}&nbsp;
        </Button>
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
  actionWrap: {
    alignItems: 'center',
    width: '100%',
  },
  actionButton: {
    minWidth: 180,
    borderRadius: 8,
  },
  tvButtonFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    transform: [{scale: 1.05}],
    elevation: 8,
  },
});

export default MsalAuth;
