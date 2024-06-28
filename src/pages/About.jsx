import React from 'react';
import {StyleSheet, View, ScrollView, RefreshControl} from 'react-native';
import {Button, Text, Layout} from '@ui-kitten/components';
import LinkText from '../components/LinkText';

function AboutScreen({navigation, route}) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <Text category="h5">XStreaming</Text>
        </View>
        <View>
          <Text category="s1">
            XStreaming is an full open-source mobile client for xCloud and Xbox
            home streaming, great inspired by
            <LinkText url={'https://github.com/unknownskl/greenlight'}>
              Greenlight
            </LinkText>
            .The application runs on Android 10+.
          </Text>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text category="h5">Want to contribute to XStreaming?</Text>
        </View>

        <View>
          <Text category="s1">XStreaming:</Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming'}>
            https://github.com/Geocld/XStreaming
          </LinkText>
        </View>

        <View>
          <Text category="s1">XStreaming-webview:</Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming-webview'}>
            https://github.com/Geocld/XStreaming-webview
          </LinkText>
        </View>

        <View>
          <Text category="s1">XStreaming-webview:</Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming-player'}>
            https://github.com/Geocld/XStreaming-player
          </LinkText>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text category="h5">About author</Text>
        </View>
        <View>
          <View>
            <Text category="s1">Geocld:</Text>
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
});

export default AboutScreen;
