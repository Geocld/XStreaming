import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {
  Layout,
  Text,
  IndexPath,
  Select,
  SelectItem,
  Input,
  TopNavigation,
  Avatar,
  ListItem,
} from '@ui-kitten/components';
import Spinner from 'react-native-loading-spinner-overlay';
import Empty from '../components/Empty';
// import mockData from '../mock/data';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';

const log = debugFactory('AchivementScreen');

const AvatarImage = props => (
  <Avatar
    {...props}
    style={[props.style, styles.itemImage]}
    source={{
      uri: 'https://images-eds-ssl.xboxlive.com/image?url=wHwbXKif8cus8csoZ03RW3apWESZjav65Yncai8aRmWL5wD_dXiCeIhr2I61i4BQAmQDiTqhWewfOSx.eg94Rasl01XcDS.5hocvl3FFDyhzsjta0h0yuKfN90YYGjROhz3CUgP7DE1EgZFOk_zKJxrpyR05l2GcDhh6wfkoBGrfGQ2rjIHQCPBNIqzB3YmY&format=png'
    }}
  />
);

function AchivementScreen({navigation}) {
  const {t} = useTranslation();

  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    console.log('123');
  });

  return (
    <>
      <Spinner
        visible={loading}
        color={'#107C10'}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      <ScrollView>
        <ListItem
          title='UI Kitten'
          description='A set of React Native components'
          accessoryLeft={AvatarImage}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
});

export default AchivementScreen;
