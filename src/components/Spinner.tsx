import React from 'react';
import {StyleProp, StyleSheet, TextStyle} from 'react-native';
import Spinner from 'react-native-loading-spinner-overlay';
import {Wander} from 'react-native-animated-spinkit';
import {getSettings} from '../store/settingStore';
import {
  DEFAULT_THEME_PRIMARY_COLOR,
  normalizeHexColor,
} from '../utils/themeColor';

type Props = {
  loading: boolean;
  cancelable?: boolean;
  text?: string;
  textStyle?: StyleProp<TextStyle>;
  closeCb?: () => void;
  onChange?: (value: any) => void;
};

const Loading: React.FC<Props> = ({
  loading,
  cancelable = false,
  text = '',
  textStyle,
  closeCb,
}) => {
  const settings = getSettings();
  const primaryColor = normalizeHexColor(
    settings.theme_primary_color,
    DEFAULT_THEME_PRIMARY_COLOR,
  );

  return (
    <Spinner
      visible={loading}
      cancelable={cancelable}
      color={primaryColor}
      overlayColor={'rgba(0, 0, 0, 0)'}
      textContent={text}
      textStyle={[styles.spinnerTextStyle, {color: primaryColor}, textStyle]}
      animation={'fade'}
      customIndicator={<Wander size={50} color={primaryColor} />}
      closeCb={closeCb}
    />
  );
};

const styles = StyleSheet.create({
  spinnerTextStyle: {
    fontWeight: '500',
  },
});

export default Loading;
