import React from 'react';
import {StyleSheet, View, ScrollView, ImageBackground} from 'react-native';
import {Card, Text, ProgressBar} from 'react-native-paper';
import Spinner from '../components/Spinner';
import Empty from '../components/Empty';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';
import moment from 'moment';
import {useSelector} from 'react-redux';
import WebApi from '../web';
import games from '../mock/games.json';

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
        data.forEach(item => {
          if (games[item.titleId] && games[item.titleId].image_urls) {
            item.image =
              games[item.titleId].image_urls.box_art ||
              games[item.titleId].image_urls.poster;
          }
        });
        setArchivements(data);
        setLoading(false);
      })
      .catch(e => {
        // log('GetHistoryAchivements error:', e);
        // console.log('GetHistoryAchivements error:', e);
        setLoading(false);
      });
  }, [webToken]);

  const formatTime = isoString => {
    const date = moment(isoString).local();
    return date.format('YYYY-MM-DD HH:mm');
  };

  return (
    <View style={styles.container}>
      <Spinner loading={loading} text={t('Loading...')} />

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
                <ImageBackground
                  source={{
                    uri:
                      infos.image ||
                      'https://store-images.s-microsoft.com/image/apps.14023.13730283751408561.58e95998-03dc-4c18-bb1e-a09073081396.c35c4567-c26b-4475-a26f-591145b3e748',
                  }}
                  style={styles.backgroundImage}
                  imageStyle={styles.backgroundImageStyle}
                  resizeMode="cover">
                  <View style={styles.overlay} />

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
                            (infos.currentGamerscore / infos.maxGamerscore) *
                              100,
                          ) + '%'}
                        </Text>
                      </View>
                    </View>
                  </Card.Content>
                </ImageBackground>
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
    marginBottom: 20,
    overflow: 'hidden',
  },
  backgroundImage: {
    flex: 1,
  },
  backgroundImageStyle: {
    opacity: 0.75,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  listItem: {
    flex: 1,
    borderRadius: 5,
    position: 'relative',
    zIndex: 1,
  },
  title: {
    paddingTop: 15,
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
    paddingBottom: 15,
  },
});

export default AchivementScreen;
