import React, {useMemo} from 'react';
import {StyleSheet, View, ScrollView, Image, Dimensions} from 'react-native';
import {Text, Card, useTheme} from 'react-native-paper';

const {width: screenWidth} = Dimensions.get('window');
const imageWidth = Math.min(screenWidth - 80, 300);

function FeedbackScreen() {
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

  const groupNumberStyle = useMemo(
    () => [
      styles.groupNumber,
      {color: theme.colors.primary},
    ],
    [theme.colors.primary],
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
          交流与支持
        </Text>
        <Text style={subtitleStyle}>
          社区交流 & 赞助开发者
        </Text>
      </View>

      {/* Community Card */}
      <Card style={cardStyle} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>加入社区</Text>
          <Text
            variant="bodyLarge"
            style={[styles.bodyText, {color: theme.colors.onSurface}]}>
            喜欢折腾、主机串流、云游戏及交流串流心得，欢迎加入群聊
          </Text>
          <View style={styles.groupBox}>
            <View
              style={[
                styles.groupBoxInner,
                {backgroundColor: theme.dark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.04)',
                },
              ]}>
              <Text style={[styles.groupLabel, {color: theme.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'}]}>
                QQ 群号
              </Text>
              <Text style={groupNumberStyle}>964721224</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Sponsor Card */}
      <Card style={cardStyle} mode="contained">
        <Card.Content style={styles.cardContent}>
          <Text style={sectionTitleStyle}>赞助开发者</Text>
          <Text
            variant="bodyLarge"
            style={[styles.bodyText, {color: theme.colors.onSurface}]}>
            赞助开发者购买 AI token 加速新功能开发
          </Text>
          <View style={styles.qrContainer}>
            <Image
              source={require('../assets/feedback/wx_sponsor.png')}
              style={[styles.qrImage, {width: imageWidth, height: imageWidth}]}
              resizeMode="contain"
            />
            <Text style={[styles.qrHint, {color: theme.dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}]}>
              微信扫码赞助
            </Text>
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
  bodyText: {
    lineHeight: 24,
    marginBottom: 16,
  },
  groupBox: {
    alignItems: 'center',
    marginTop: 4,
  },
  groupBoxInner: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  groupLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  groupNumber: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  qrContainer: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  qrImage: {
    borderRadius: 14,
  },
  qrHint: {
    fontSize: 13,
    marginTop: 12,
  },
});

export default FeedbackScreen;
