import React from 'react';
import {StyleSheet, View, ScrollView, Image} from 'react-native';
import {Text} from 'react-native-paper';
import LinkText from '../components/LinkText';

function FeedbackScreen({navigation, route}) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">交流</Text>
        </View>
        <View>
          <Text variant="titleMedium">
            喜欢折腾、主机串流、云游戏及串流技术开发，欢迎加入群聊
          </Text>
          <Text variant="titleMedium">群号：964721224</Text>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">支持</Text>
        </View>

        <View>
          <Text variant="titleMedium">
            请作者喝杯咖啡，大家的支持就是持续开发维护的动力
          </Text>
        </View>
        <View style={{paddingBottom: 50}}>
          <Text variant="titleMedium">Wechat</Text>
          <Image
            source={require('../assets/feedback/wechat.jpg')}
            style={{width: 200, height: 200}}
          />
        </View>

        <View style={{paddingBottom: 50}}>
          <Text variant="titleMedium">Alipay</Text>
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
