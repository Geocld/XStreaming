import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Card, Text, ProgressBar} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import Empty from '../components/Empty';
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
    webApi
      .getHistoryAchivements()
      .then(data => {
        setArchivements(data);
        setLoading(false);
      })
      .catch(e => {
        log('GetHistoryAchivements error:', e);
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

      {!loading && !archivements.length && <Empty />}

      {archivements.length > 0 && (
        <ScrollView>
          {archivements.map((infos, idx) => {
            return (
              <Card
                style={styles.card}
                key={infos.titleId || idx}
                onPress={() => {
                  navigation.navigate('AchivementDetail', {
                    name: infos.name,
                    titleId: infos.titleId,
                  });
                }}>
                <Card.Content style={styles.listItem}>
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
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    flex: 1,
  },
  card: {
    marginBottom: 10,
  },
  spinnerTextStyle: {
    color: '#107C10',
  },
  listItem: {
    flex: 1,
    borderRadius: 5,
  },
  text: {
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
