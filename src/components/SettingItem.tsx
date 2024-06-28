import React from 'react';
import {StyleSheet, View, TouchableOpacity} from 'react-native';
import {Text, Divider} from '@ui-kitten/components';

type Props = {
  title: string;
  description: string;
  onPress: () => void;
};

const SettingItem: React.FC<Props> = ({title, description, onPress}) => {
  const handlePress = () => {
    onPress && onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <View style={styles.listItem}>
        <Text style={styles.title} category="h6">
          {title}
        </Text>
        <Text style={styles.description} appearance="hint">
          {description}
        </Text>
        <Divider />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  listItem: {
    paddingTop: 10,
    paddingLeft: 18,
    paddingRight: 20,
  },
  title: {
    paddingBottom: 5,
  },
  description: {
    paddingBottom: 15,
  },
});

export default SettingItem;
