import React from 'react';
import {StyleSheet} from 'react-native';
import Spinner from 'react-native-loading-spinner-overlay';
import {Wander} from 'react-native-animated-spinkit';

type Props = {
  loading: boolean;
  cancelable: boolean;
  text: string;
  onChange: (value: any) => {};
};

const COLOR = '#107C10';

const Loading: React.FC<Props> = ({loading, cancelable = false, text}) => {
  return (
    <Spinner
      visible={loading}
      cancelable={cancelable}
      color={COLOR}
      overlayColor={'rgba(0, 0, 0, 0)'}
      textContent={text}
      textStyle={styles.spinnerTextStyle}
      animation={'fade'}
      customIndicator={<Wander size={50} color={COLOR} />}
    />
  );
};

const styles = StyleSheet.create({
  spinnerTextStyle: {
    color: COLOR,
  },
});

export default Loading;
