import React from 'react';
import {StyleSheet, View, ScrollView, Pressable} from 'react-native';
import {Text, ProgressBar} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import Empty from '../components/Empty';
// import mockData from '../mock/data';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';
import moment from 'moment';
import {useSelector, useDispatch} from 'react-redux';
import WebApi from '../web';

const log = debugFactory('AchivementScreen');

function AchivementScreen({navigation}) {
  const {t} = useTranslation();

  const [loading, setLoading] = React.useState(false);
  const [archivements, setArchivements] = React.useState([]);
  const webToken = useSelector(state => state.webToken);

  React.useEffect(() => {
    setLoading(true);
    const webApi = new WebApi(webToken);
    webApi.getHistoryAchivements().then(data => {
      setArchivements(data);
      setLoading(false);
    });
  }, [webToken]);

  const formatTime = isoString => {
    const date = moment(isoString).local();
    return date.format('YYYY-MM-DD HH:mm:ss');
  };

  return (
    <View style={styles.container}>
      <Spinner
        visible={loading}
        color={'#107C10'}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      <ScrollView>
        {archivements.map((infos, idx) => {
          return (
            <Pressable
              style={styles.listItem}
              key={infos.titleId || idx}
              onPress={() => {
                navigation.navigate('AchivementDetail', {
                  name: infos.name,
                  titleId: infos.titleId,
                });
              }}>
              <View style={styles.title}>
                <Text style={styles.text} variant="titleMedium">
                  {infos.name}
                </Text>
              </View>
              <View style={styles.time}>
                <Text style={styles.text} variant="titleSmall">
                  {formatTime(infos.lastUnlock)}
                </Text>
              </View>
              <View style={styles.progressBar}>
                <ProgressBar
                  progress={infos.currentGamerscore / infos.maxGamerscore}
                />
              </View>
              <View style={styles.footer}>
                <View style={styles.score}>
                  <Text style={styles.text} variant="titleSmall">
                    {t('score')}: {infos.currentGamerscore}/
                    {infos.maxGamerscore}
                  </Text>
                </View>
                <View style={styles.percent}>
                  <Text style={styles.text} variant="titleSmall">
                    {Math.floor(
                      (infos.currentGamerscore / infos.maxGamerscore) * 100,
                    ) + '%'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  listItem: {
    flex: 1,
    backgroundColor: 'rgba(143, 155, 179, 0.30)',
    padding: 15,
    marginBottom: 10,
    borderRadius: 5,
  },
  text: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  progressBar: {
    marginTop: 15,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    flexDirection: 'row',
    marginTop: 10,
  },
});

export default AchivementScreen;
