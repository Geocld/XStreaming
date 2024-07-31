import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {useTranslation} from 'react-i18next';

type Props = {
  // titleItem: any;
  // onPress: (titleItem: any) => {};
};

const Empty: React.FC<Props> = () => {
  const {t} = useTranslation();
  return (
    <View style={styles.container}>
      <Text variant="titleMedium">{t('NoData')}</Text>
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
});

export default Empty;
