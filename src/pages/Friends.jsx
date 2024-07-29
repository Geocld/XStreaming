import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
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
import {useSelector, useDispatch} from 'react-redux';
// import data from '../mock/friends';
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
    webApi.getFriends().then(data => {
      setFriends(data);
      setLoading(false);
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
        textContent={t('Loading...')}
        textStyle={styles.spinnerTextStyle}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {friends.map((userinfo, idx) => {
          return (
            <View style={styles.listItem} key={userinfo.xuid || idx}>
              <Avatar
                style={styles.avatar}
                size="large"
                source={{
                  uri: userinfo.displayPicRaw || '',
                }}
              />
              <View>
                <View style={styles.title}>
                  <Text style={styles.text} category="h6" appearance="hint">
                    {userinfo.modernGamertag}
                  </Text>
                  {userinfo.modernGamertagSuffix && (
                    <Text
                      style={[styles.text, styles.suffix]}
                      category="s2"
                      appearance="hint">
                      #{userinfo.modernGamertagSuffix}
                    </Text>
                  )}
                </View>
                <View style={styles.title}>
                  <Text style={styles.text} category="p1" appearance="hint">
                    {userinfo.displayName}
                  </Text>
                  {userinfo.realName && (
                    <Text
                      style={[styles.text, styles.realName]}
                      category="p1"
                      appearance="hint">
                      ({userinfo.realName})
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.text} category="p2" appearance="hint">
                    {drawPresence(userinfo)}
                  </Text>
                </View>
              </View>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(143, 155, 179, 0.30)',
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
    color: '#ffffff',
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
