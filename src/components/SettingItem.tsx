import React from 'react';
import {List, Divider, useTheme} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  title: string;
  description?: string;
  onPress: () => void;
};

const SettingItem: React.FC<Props> = React.memo(({title, description, onPress}) => {
  const theme = useTheme();
  const iconColor = theme.dark ? '#fff' : '#333';

  return (
    <>
      <List.Item
        title={title}
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
      <Divider />
    </>
  );
});

export default SettingItem;
