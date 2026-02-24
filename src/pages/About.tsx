import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text} from 'react-native-paper';
import LinkText from '../components/LinkText';

function AboutScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">XStreaming</Text>
        </View>
        <View>
          <Text variant="titleMedium">
            XStreaming is an Open source Xbox streaming client that allows you
            stream Xbox and play xCloud anytime, supporting Android/iOS.
          </Text>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">Contribute to XStreaming</Text>
        </View>

        <View>
          <Text variant="titleMedium">XStreaming:</Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming'}>
            https://github.com/Geocld/XStreaming
          </LinkText>
        </View>

        <View style={{marginTop: 15}}>
          <Text variant="titleMedium">
            XStreaming-desktop(Windows/MacOS/SteamOS):
          </Text>
        </View>
        <View>
          <LinkText url={'https://github.com/Geocld/XStreaming-desktop'}>
            https://github.com/Geocld/XStreamingDesktop
          </LinkText>
        </View>

        <View style={{marginTop: 15}}>
          <Text variant="titleMedium">iOS(PeaSyo):</Text>
        </View>
        <View>
          <LinkText url={'https://apps.apple.com/us/app/peasyo/id6743263824'}>
            https://apps.apple.com/us/app/peasyo/id6743263824
          </LinkText>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <Text variant="titleLarge">
            Are you looking for an Playstation streaming client?
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
          <Text variant="titleLarge">About author</Text>
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
});

export default AboutScreen;
