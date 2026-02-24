import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text} from 'react-native-paper';
import LinkText from '../components/LinkText';

function AboutZhScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">XStreaming</Text>
        </View>
        <View>
          <Text variant="titleMedium">
            XStreaming是一款开源的Xbox/云游戏串流移动端客户端,你可以使用XStreaming在任何地方连接Xbox主机和游玩xCloud，支持Android/iOS/Windows/MacOS/SteamOS/HarmonyOS
          </Text>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">给XStreaming做贡献</Text>
        </View>

        <View>
          <Text variant="titleMedium">XStreaming代码仓库:</Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming'}>
            https://github.com/Geocld/XStreaming
          </LinkText>
        </View>

        <View style={styles.mt15}>
          <Text variant="titleMedium">
            桌面端 XStreaming-desktop(Windows/MacOS/SteamOS):
          </Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming-desktop'}>
            https://github.com/Geocld/XStreamingDesktop
          </LinkText>
        </View>

        <View style={styles.mt15}>
          <Text variant="titleMedium">iOS(PeaSyo):</Text>
        </View>
        <View>
          <LinkText url={'https://apps.apple.com/us/app/peasyo/id6743263824'}>
            https://apps.apple.com/us/app/peasyo/id6743263824
          </LinkText>
        </View>

        <View style={styles.mt15}>
          <Text variant="titleMedium">鸿蒙:</Text>
        </View>
        <View>
          <LinkText
            url={
              'https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh'
            }>
            https://appgallery.huawei.com/app/detail?id=com.lijiahao.xstreamingoh
          </LinkText>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">
            如果你在找一款PlayStation串流客户端，可以尝试安卓端PeaSyo：
          </Text>
        </View>

        <View>
          <Text variant="titleMedium">PeaSyo:</Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/PeaSyo'}>
            https://github.com/Geocld/PeaSyo
          </LinkText>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">关于作者</Text>
        </View>
        <View>
          <View>
            <Text variant="titleMedium">Geocld:</Text>
          </View>
          <View>
            <LinkText url={'https://github.com/Geocld'}>
              https://github.com/Geocld
            </LinkText>
          </View>
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
    marginBottom: 20,
  },
  title: {
    marginBottom: 10,
  },
  mt15: {
    marginTop: 15,
  },
});

export default AboutZhScreen;
