import React from 'react';
import {StyleSheet, View, ScrollView, FlatList, Dimensions} from 'react-native';
import {Layout, Text, Button} from '@ui-kitten/components';
import Spinner from 'react-native-loading-spinner-overlay';
import {getSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import {useSelector} from 'react-redux';
import {debugFactory} from '../utils/debug';
import WebApi from '../web';
import ArchivementItem from '../components/ArchivementItem';
// import mockData from '../mock/achivement';

const log = debugFactory('ArchivementDetail');

function ArchivementDetail({navigation, route}) {
  const {t} = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [numColumns, setNumColumns] = React.useState(2);
  const [archivements, setArchivements] = React.useState([]);

  const webToken = useSelector(state => state.webToken);
  const flatListRef = React.useRef(null);

  React.useEffect(() => {
    log.info('ArchivementDetail titleId:', route.params?.titleId);
    if (route.params?.titleId) {
      setLoading(true);
      const webApi = new WebApi(webToken);
      webApi.getAchivementDetail(route.params?.titleId).then(data => {
        setArchivements(data);
        setLoading(false);
      });
    }
    navigation.setOptions({
      title: route.params?.name || '',
    });
    const updateLayout = () => {
      const {width, height} = Dimensions.get('window');
      setNumColumns(width > height ? 4 : 2);
    };
    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);

    return () => {
      subscription?.remove();
    };
  }, [route.params?.titleId, route.params?.name, navigation, webToken]);

  return (
    <Layout style={styles.container}>
      <Spinner
        visible={loading}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      <FlatList
        ref={flatListRef}
        data={archivements}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={styles.listContainer}
        renderItem={({item}) => {
          return (
            <View
              style={numColumns === 2 ? styles.listItemH : styles.listItemV}>
              <ArchivementItem item={item} />
            </View>
          );
        }}
      />
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  spinnerTextStyle: {
    color: '#FFF',
  },
  listContainer: {},
  listItemH: {
    width: '50%',
    justifyContent: 'center',
  },
  listItemV: {
    width: '25%',
    justifyContent: 'center',
  },
});

export default ArchivementDetail;
