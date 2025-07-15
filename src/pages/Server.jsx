import React from 'react';
import {StyleSheet, View, ScrollView, Text} from 'react-native';

function ServerScreen({navigation, route}) {
  React.useEffect(() => {}, [navigation]);

  return (
    <ScrollView>
      <View>
        <Text>server</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({});

export default ServerScreen;
