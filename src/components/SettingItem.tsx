import React from 'react';
import {List, Divider, useTheme} from 'react-native-paper';
import {StyleSheet, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  title: string;
  description?: string;
  isFocused?: boolean;
  onPress: () => void;
};

const SettingItem: React.FC<Props> = React.memo(({title, description, isFocused, onPress}) => {
  const theme = useTheme();
  const iconColor = isFocused ? theme.colors.primary : theme.dark ? '#fff' : '#333';

  return (
    <View
      style={[
        styles.container,
        isFocused && [
          styles.focusedContainer,
          {
            backgroundColor: theme.dark
              ? 'rgba(255, 255, 255, 0.14)'
              : 'rgba(0, 0, 0, 0.08)',
            borderColor: theme.colors.primary,
          },
        ],
      ]}>
      <List.Item
        title={title}
        titleStyle={isFocused ? {color: theme.colors.primary, fontWeight: '700'} : undefined}
        description={description}
        descriptionNumberOfLines={4}
        right={() => (
          <Ionicons
            name={'chevron-forward-outline'}
            size={20}
            color={iconColor}
          />
        )}
        onPress={onPress}
      />
      {!isFocused && <Divider />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focusedContainer: {
    elevation: 4,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.3,
  },
});

export default SettingItem;
