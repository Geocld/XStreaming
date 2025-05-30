import React from 'react';
import {StyleSheet, View, ScrollView, RefreshControl} from 'react-native';
import {Card, Text, Avatar} from 'react-native-paper';
import Spinner from 'react-native-loading-spinner-overlay';
import Empty from '../components/Empty';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';
import {useSelector} from 'react-redux';
import WebApi from '../web';

const log = debugFactory('FriendsScreen');

function FriendsScreen({navigation}) {
  const {t} = useTranslation();

  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [friends, setFriends] = React.useState([]);
  const timer = React.useRef(null);

  const webToken = useSelector(state => state.webToken);

  React.useEffect(() => {
    setLoading(true);
    const webApi = new WebApi(webToken);
    webApi
      .getFriends()
      .then(data => {
        setFriends(data);
        setLoading(false);
      })
      .catch(e => {
        log('GetFriends error:', e);
      });

    timer.current = setInterval(() => {
      webApi.getFriends().then(data => {
        setFriends(data);
      });
    }, 30 * 1000);
  }, [webToken]);

  const drawPresence = userinfo => {
    for (const app in userinfo.presenceDetails) {
      if (
        userinfo.presenceDetails[app].IsGame &&
        userinfo.presenceDetails[app].IsPrimary
      ) {
        return userinfo.presenceDetails[app].PresenceText;
      }
    }

    return userinfo.presenceText;
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const webApi = new WebApi(webToken);
    const _friends = await webApi.getFriends();
    setFriends(_friends);
    setRefreshing(false);
  }, [webToken]);

  return (
    <View style={styles.container}>
      <Spinner
        visible={loading}
        color={'#107C10'}
        overlayColor={'rgba(0, 0, 0, 0)'}
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      {!loading && !friends.length && <Empty />}

      {friends.length > 0 && (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          {friends.map((userinfo, idx) => {
            return (
              <Card key={userinfo.xuid || idx} style={styles.card}>
                <Card.Content style={styles.listItem}>
                  <Avatar.Image
                    style={styles.avatar}
                    size={64}
                    source={{
                      uri: userinfo.displayPicRaw || '',
                    }}
                  />
                  <View>
                    <View style={styles.title}>
                      <Text style={styles.text} variant="titleMedium">
                        {userinfo.modernGamertag}
                      </Text>
                      {userinfo.modernGamertagSuffix && (
                        <Text
                          style={[styles.text, styles.suffix]}
                          variant="titleSmall">
                          #{userinfo.modernGamertagSuffix}
                        </Text>
                      )}
                    </View>
                    <View style={styles.title}>
                      <Text style={styles.text} variant="labelSmall">
                        {userinfo.displayName}
                      </Text>
                      {userinfo.realName && (
                        <Text
                          style={[styles.text, styles.realName]}
                          variant="labelSmall">
                          ({userinfo.realName})
                        </Text>
                      )}
                    </View>
                    <View>
                      <Text style={styles.text} variant="labelSmall">
                        {drawPresence(userinfo)}
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginBottom: 10,
    borderRadius: 5,
  },
  avatar: {
    marginRight: 10,
  },
  title: {
    flexDirection: 'row',
  },
  text: {
    fontWeight: 'bold',
    marginBottom: 2,
  },
  suffix: {
    marginTop: 3,
    marginLeft: 5,
  },
  realName: {
    marginLeft: 5,
  },
});

export default FriendsScreen;
