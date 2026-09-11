import React from 'react';
import {StyleSheet, View, ScrollView, RefreshControl, Platform} from 'react-native';
import {Card, Text, Avatar} from 'react-native-paper';
import Spinner from '../components/Spinner';
import Empty from '../components/Empty';
import {debugFactory} from '../utils/debug';
import {useTranslation} from 'react-i18next';
import {useSelector} from 'react-redux';
import WebApi from '../web';
import {useGamepadNavigation, useGamepadActiveState} from '../utils/useGamepadNavigation';
import GamepadFooterHints from '../components/GamepadFooterHints';

const log = debugFactory('FriendsScreen');

function FriendsScreen({navigation}: any) {
  const {t} = useTranslation();

  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [friends, setFriends] = React.useState<any[]>([]);
  const [isGamepadActive, setIsGamepadActive] = useGamepadActiveState();
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const timer = React.useRef<any>(null);

  const webToken = useSelector((state: any) => state.webToken);

  useGamepadNavigation({
    onUp: () => {
      setFocusedIndex(prev => Math.max(0, prev - 1));
    },
    onDown: () => {
      setFocusedIndex(prev => Math.min(friends.length - 1, prev + 1));
    },
    onBack: () => {
      navigation.goBack();
    },
  });

  React.useEffect(() => {
    if (isGamepadActive || Platform.isTV) {
      const targetY = Math.max(0, focusedIndex * 90 - 80);
      scrollViewRef.current?.scrollTo({y: targetY, animated: true});
    }
  }, [focusedIndex, isGamepadActive]);

  React.useEffect(() => {
    setLoading(true);
    const webApi = new WebApi(webToken);
    webApi
      .getFriends()
      .then((data: any) => {
        setFriends(data || []);
        setLoading(false);
      })
      .catch((e: any) => {
        log.error('GetFriends error:', e);
        setLoading(false);
      });

    timer.current = setInterval(() => {
      webApi.getFriends().then((data: any) => {
        setFriends(data || []);
      });
    }, 30 * 1000);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [webToken]);

  const drawPresence = (userinfo: any) => {
    if (!userinfo || !userinfo.presenceDetails) return userinfo?.presenceText || '';
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
    const _friends: any = await webApi.getFriends();
    setFriends(_friends || []);
    setRefreshing(false);
  }, [webToken]);

  return (
    <View
      style={styles.container}
      onTouchStart={() => {
        if (!Platform.isTV) setIsGamepadActive(false);
      }}>
      <Spinner loading={loading} text={t('Loading...')} />

      {!loading && !friends.length && <Empty />}

      {friends.length > 0 && (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={
            isGamepadActive || Platform.isTV ? {paddingBottom: 64} : undefined
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          {friends.map((userinfo, idx) => {
            const isFocused =
              (isGamepadActive || Platform.isTV) && focusedIndex === idx;
            return (
              <Card
                key={userinfo.xuid || idx}
                style={[styles.card, isFocused && styles.cardFocused]}>
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

      <GamepadFooterHints
        visible={isGamepadActive || Platform.isTV}
        hints={[{button: 'B', label: t('Back')}]}
      />
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
  cardFocused: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    transform: [{scale: 1.02}],
    elevation: 8,
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
