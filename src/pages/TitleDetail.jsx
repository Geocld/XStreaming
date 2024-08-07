import React from 'react';
import {StyleSheet, View, ScrollView, Image} from 'react-native';
import {Text, Button} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import {getSettings} from '../store/settingStore';
import {useTranslation} from 'react-i18next';
import {debugFactory} from '../utils/debug';

const log = debugFactory('TitleDetailScreen');

function TitleDetail({navigation, route}) {
  const {t} = useTranslation();
  const [titleItem, setTitleItem] = React.useState(null);
  const [settings, setSettings] = React.useState({});

  React.useEffect(() => {
    log.info('TitleDetail titleItem:', route.params?.titleItem);
    if (route.params?.titleItem) {
      setTitleItem(route.params.titleItem);
    }
    const _settings = getSettings();
    setSettings(_settings);
    navigation.setOptions({
      title: route.params?.titleItem.ProductTitle || '',
    });
  }, [route.params?.titleItem, navigation]);

  const handleStartGame = () => {
    log.info('HandleStartCloudGame titleId:', titleItem.XCloudTitleId);
    navigation.navigate({
      name: 'Stream',
      params: {
        sessionId: titleItem.titleId || titleItem.XCloudTitleId,
        settings,
        streamType: 'cloud',
      },
    });
  };

  return (
    <View style={styles.container}>
      <Spinner
        visible={!titleItem}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      {titleItem && (
        <>
          <ScrollView style={styles.scrollView}>
            <Image
              source={{
                uri: 'https:' + titleItem.Image_Poster.URL,
              }}
              resizeMode="cover"
              style={styles.image}
            />
            <View style={styles.textWrap}>
              <Text variant="titleLarge" style={styles.productTitle}>
                {titleItem.ProductTitle}
              </Text>
              <Text variant="titleMedium">{titleItem.PublisherName}</Text>
            </View>

            <View style={styles.tagsWrap}>
              {titleItem.Categories.map(item => {
                return (
                  <View style={styles.tagContainer} key={item}>
                    <Text variant="titleSmall">{item}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.buttonWrap}>
            <Button
              mode="contained"
              style={styles.button}
              onPress={handleStartGame}>
              {t('Start game')}
            </Button>
            <Button
              mode="outlined"
              style={styles.button}
              onPress={() => navigation.goBack()}>
              {t('Back')}
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  spinnerTextStyle: {
    color: '#FFF',
  },
  scrollView: {
    flex: 1,
    marginBottom: 120, // Adjust the marginBottom value to accommodate the button height
  },
  image: {
    width: '100%',
    height: 960 / 4,
  },
  textWrap: {
    padding: 10,
  },
  tagsWrap: {
    padding: 10,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tagContainer: {
    borderColor: '#999999',
    borderWidth: 1,
    borderRadius: 5,
    padding: 5,
    marginRight: 5,
    marginBottom: 10,
  },
  productTitle: {
    marginBottom: 10,
  },
  buttonWrap: {
    position: 'absolute',
    left: 0,
    width: '100%',
    bottom: 20,
    paddingLeft: 10,
    paddingRight: 10,
  },
  button: {
    marginTop: 10,
  },
});

export default TitleDetail;
