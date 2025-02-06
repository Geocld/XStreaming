import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Avatar, Text, Icon} from 'react-native-paper';

type Props = {
  profile: any;
};

const QuickMenu: React.FC<Props> = ({profile}) => {
  return (
    <View style={styles.container}>
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    zIndex: 10,
  },
});

export default QuickMenu;
