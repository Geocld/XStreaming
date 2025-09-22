import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text, Card, Divider} from 'react-native-paper';
import axios from 'axios';
import {useTranslation} from 'react-i18next';
import Spinner from '../components/Spinner';

const formatMdString = md => {
  return md
    .replace(/##\s/g, '')
    .replace(/\r\n---\r\n/g, '\n')
    .replace(/\[([^\]]+)\]$([^)]+)$/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/^-\s/gm, '• ');
};

function HistoryScreen({navigation, route}) {
  const {t, i18n} = useTranslation();
  const currentLanguage = i18n.language;
  const [loading, setLoading] = React.useState(false);
  const [releases, setReleases] = React.useState([]);

  React.useEffect(() => {
    setLoading(true);
    axios
      .get('https://api.github.com/repos/Geocld/XStreaming/releases', {
        timeout: 30 * 1000,
      })
      .then(res => {
        setLoading(false);
        if (res && res.data) {
          setReleases(res.data);
        }
      })
      .catch(e => {
        setLoading(false);
      });
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Spinner loading={loading} cancelable={true} />

      <View style={styles.block}>
        <View>
          {releases.map(release => {
            return (
              <Card key={release.id} style={{marginBottom: 30}}>
                <Card.Content>
                  <Text variant="titleLarge">{release.name}</Text>
                  <Text variant="bodyMedium">
                    {formatMdString(release.body)}
                  </Text>
                </Card.Content>
              </Card>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  block: {
    marginBottom: 50,
  },
  title: {
    marginBottom: 10,
  },
});

export default HistoryScreen;
