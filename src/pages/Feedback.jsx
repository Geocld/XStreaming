import React from 'react';
import {StyleSheet, View, ScrollView, Image} from 'react-native';
import {Text} from 'react-native-paper';
import LinkText from '../components/LinkText';

function FeedbackScreen({navigation, route}) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">反馈</Text>
        </View>
        <View>
          <Text variant="titleMedium">
            如果你使用过程遇到任何问题或有更好的建议及想法，都可以加入XStreaming使用群进行交流。
          </Text>
          <Text variant="titleMedium">二维码失效请加群号：958931336</Text>
          <Image
            source={require('../assets/feedback/QQ.jpg')}
            style={styles.image}
          />
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">支持</Text>
        </View>

        <View>
          <Text variant="titleMedium">
            XStreaming始终坚持开源免费，旨在为Xbox玩家串流玩家提供多一个串流选择，后续还会继续推出其他平台客户端，作者平时也喜欢玩游戏，也是使用业余时间开发软件，如果觉得XStreaming好用，不妨请作者喝杯咖啡，大家的支持就是持续开发维护的动力~
          </Text>
        </View>
        <View style={{paddingBottom: 50}}>
          <Text variant="titleMedium">微信</Text>
          <Image
            source={require('../assets/feedback/wechat.jpg')}
            style={{width: 200, height: 200}}
          />
        </View>

        <View style={{paddingBottom: 50}}>
          <Text variant="titleMedium">支付宝</Text>
          <Image
            source={require('../assets/feedback/alipay.jpg')}
            style={{width: 200, height: 200}}
          />
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
  image: {
    width: '100%',
    height: 500,
  },
});

export default FeedbackScreen;
