import React, {useMemo} from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text, Card, useTheme} from 'react-native-paper';
import axios from 'axios';
import {useTranslation} from 'react-i18next';
import Spinner from '../components/Spinner';

function ThanksScreen() {
  const {i18n, t} = useTranslation();
  const currentLanguage = i18n.language;
  const theme = useTheme();
  const [loading, setLoading] = React.useState(false);
  const [lists, setLists] = React.useState<string[]>([]);

  React.useEffect(() => {
    setLoading(true);
    axios
      .get('https://xstreaming-support.pages.dev/supports.json', {
        timeout: 30 * 1000,
      })
      .then(res => {
        setLoading(false);
        if (res && res.data && res.data.lists) {
          setLists(res.data.lists);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const cardStyle = useMemo(
    () => [
      styles.card,
      {
        backgroundColor: theme.dark
          ? 'rgba(18, 20, 32, 0.84)'
          : 'rgba(255, 255, 255, 0.68)',
        borderColor: theme.dark
          ? 'rgba(255, 255, 255, 0.12)'
          : 'rgba(255, 255, 255, 0.56)',
        shadowOpacity: theme.dark ? 0.32 : 0.12,
      },
    ],
    [theme.dark],
  );

  const accentStyle = useMemo(
    () => [styles.accentBar, {backgroundColor: theme.colors.primary}],
    [theme.colors.primary],
  );

  const sectionTitleStyle = useMemo(
    () => [styles.sectionTitle, {color: theme.colors.primary}],
    [theme.colors.primary],
  );

  const subtitleStyle = useMemo(
    () => [
      styles.subtitle,
      {color: theme.dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'},
    ],
    [theme.dark],
  );

  const listItemBg = useMemo(
    () => ({
      backgroundColor: theme.dark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.03)',
    }),
    [theme.dark],
  );

  const dotColor = useMemo(
    () => ({backgroundColor: theme.colors.primary}),
    [theme.colors.primary],
  );

  const isZh = currentLanguage === 'zh' || currentLanguage === 'zht';

  const introText = isZh
    ? 'XStreaming 作为开源项目始终坚持给大家提供多一种 Xbox 串流选择，但此项工作绝不是一个人能完成的。特别鸣谢下面的朋友在开发期间提供宝贵的帮助和支持（排名不分先后）：'
    : "XStreaming, as an open-source project, has always been committed to providing everyone with an alternative option for Xbox streaming. However, this endeavor is by no means a one-person effort. A special thanks goes out to the following friends for their invaluable assistance and support during the development process (in no particular order):";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}>
      <Spinner loading={loading} cancelable={true} />

      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={accentStyle} />
        <Text
          variant="displaySmall"
          style={[styles.heroTitle, {color: theme.colors.onBackground}]}>
          {t('Thanks')}
        </Text>
        <Text style={subtitleStyle}>
          {isZh ? '感谢每一位贡献者' : 'Grateful for every contributor'}
        </Text>
      </View>

      {/* Intro Card */}
      <Card style={cardStyle} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>
            {isZh ? '特别鸣谢' : 'Special Thanks'}
          </Text>
          <Text
            variant="bodyLarge"
            style={[styles.introText, {color: theme.colors.onSurface}]}>
            {introText}
          </Text>
        </Card.Content>
      </Card>

      {/* Supporters List Card */}
      {lists.length > 0 && (
        <Card style={cardStyle} mode="contained">
          <Card.Content style={styles.cardContent}>
            <Text style={sectionTitleStyle}>
              {isZh ? '贡献者名单' : 'Contributors'}
            </Text>
            <View style={styles.listContainer}>
              {lists.map((item, index) => (
                <View key={index} style={[styles.listItem, listItemBg]}>
                  <View style={[styles.dot, dotColor]} />
                  <Text
                    style={[
                      styles.nameText,
                      {color: theme.colors.onSurface},
                    ]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  accentBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
  },
  heroTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 16,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowRadius: 24,
    marginBottom: 16,
  },
  cardContent: {
    padding: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  introText: {
    lineHeight: 24,
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 12,
  },
  nameText: {
    fontSize: 15,
    lineHeight: 22,
  },
});

export default ThanksScreen;
