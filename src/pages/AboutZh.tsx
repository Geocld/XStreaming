import React, {useMemo} from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text, Card, useTheme} from 'react-native-paper';
import LinkText from '../components/LinkText';

function AboutZhScreen() {
  const theme = useTheme();

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

  const labelStyle = useMemo(
    () => [
      styles.label,
      {color: theme.dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'},
    ],
    [theme.dark],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}>
      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={accentStyle} />
        <Text
          variant="displaySmall"
          style={[styles.heroTitle, {color: theme.colors.onBackground}]}>
          XStreaming
        </Text>
        <Text style={subtitleStyle}>
          开源 Xbox / 云游戏串流客户端
        </Text>
        <View style={styles.versionBadge}>
          <View
            style={[styles.badge, {backgroundColor: theme.colors.primaryContainer}]}>
            <Text
              variant="labelSmall"
              style={{color: theme.colors.onPrimaryContainer}}>
              v2.9.0
            </Text>
          </View>
        </View>
      </View>

      {/* About Card */}
      <Card style={cardStyle} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>关于 XStreaming</Text>
          <Text
            variant="bodyLarge"
            style={{color: theme.colors.onSurface, lineHeight: 24}}>
            XStreaming 是一款开源的 Xbox / 云游戏串流移动端客户端，你可以使用
            XStreaming 在任何地方连接 Xbox 主机和游玩 xCloud，支持
            Android / iOS / Windows / macOS / SteamOS / HarmonyOS。
          </Text>
        </Card.Content>
      </Card>

      {/* Contribute Card */}
      <Card style={cardStyle} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>给 XStreaming 做贡献</Text>

          <View style={styles.linkRow}>
            <View style={styles.linkIcon}>
              <Text style={[styles.icon, {color: theme.colors.primary}]}>
                {'<>'}
              </Text>
            </View>
            <View style={styles.linkContent}>
              <Text style={labelStyle}>XStreaming 代码仓库</Text>
              <LinkText url="https://github.com/Geocld/XStreaming">
                github.com/Geocld/XStreaming
              </LinkText>
            </View>
          </View>

          <View style={styles.linkDivider} />

          <View style={styles.linkRow}>
            <View style={styles.linkIcon}>
              <Text style={[styles.icon, {color: theme.colors.primary}]}>
                {'\u{1F4BB}'}
              </Text>
            </View>
            <View style={styles.linkContent}>
              <Text style={labelStyle}>
                桌面端 XStreaming-desktop (Windows / macOS / SteamOS)
              </Text>
              <LinkText url="https://github.com/Geocld/XStreaming-desktop">
                github.com/Geocld/XStreamingDesktop
              </LinkText>
            </View>
          </View>

          <View style={styles.linkDivider} />

          <View style={styles.linkRow}>
            <View style={styles.linkIcon}>
              <Text style={[styles.icon, {color: theme.colors.primary}]}>
                {'\u{1F34E}'}
              </Text>
            </View>
            <View style={styles.linkContent}>
              <Text style={labelStyle}>iOS (PeaSyo)</Text>
              <LinkText url="https://apps.apple.com/us/app/peasyo/id6743263824">
                apps.apple.com/us/app/peasyo
              </LinkText>
            </View>
          </View>

          <View style={styles.linkDivider} />

          <View style={styles.linkRow}>
            <View style={styles.linkIcon}>
              <Text style={[styles.icon, {color: theme.colors.primary}]}>
                {'\u{1F310}'}
              </Text>
            </View>
            <View style={styles.linkContent}>
              <Text style={labelStyle}>鸿蒙</Text>
              <LinkText url="https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh">
                appgallery.huawei.com
              </LinkText>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Related Projects Card */}
      <Card style={cardStyle} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>
            如果你在找一款 PlayStation 串流客户端
          </Text>

          <View style={styles.linkRow}>
            <View style={styles.linkIcon}>
              <Text style={[styles.icon, {color: theme.colors.primary}]}>
                {'\u{1F3AE}'}
              </Text>
            </View>
            <View style={styles.linkContent}>
              <Text style={labelStyle}>PeaSyo</Text>
              <LinkText url="https://github.com/Geocld/PeaSyo">
                github.com/Geocld/PeaSyo
              </LinkText>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Author Card */}
      <Card style={[cardStyle, styles.lastCard]} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>关于作者</Text>

          <View style={styles.linkRow}>
            <View style={styles.linkIcon}>
              <Text style={[styles.icon, {color: theme.colors.primary}]}>
                {'\u{1F464}'}
              </Text>
            </View>
            <View style={styles.linkContent}>
              <Text style={labelStyle}>Geocld</Text>
              <LinkText url="https://github.com/Geocld">
                github.com/Geocld
              </LinkText>
            </View>
          </View>
        </Card.Content>
      </Card>
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
  versionBadge: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
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
  lastCard: {
    marginBottom: 0,
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  linkIcon: {
    width: 36,
    alignItems: 'center',
    paddingTop: 2,
  },
  icon: {
    fontSize: 16,
  },
  linkContent: {
    flex: 1,
  },
  linkDivider: {
    height: 1,
    backgroundColor: 'rgba(128,128,128,0.15)',
    marginVertical: 6,
  },
  label: {
    fontSize: 13,
    marginBottom: 2,
    fontWeight: '500',
  },
});

export default AboutZhScreen;
