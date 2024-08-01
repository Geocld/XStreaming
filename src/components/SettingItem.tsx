import React from 'react';
import {useColorScheme} from 'react-native';
import {List, Divider} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {getSettings} from '../store/settingStore';

type Props = {
  title: string;
  description: string;
  onPress: () => void;
};

const SettingItem: React.FC<Props> = ({title, description, onPress}) => {
  const colorScheme = useColorScheme();
  const settings = getSettings();
  const handlePress = () => {
    onPress && onPress();
  };

  let theme = settings.theme ?? 'dark';
  if (settings.theme === 'auto') {
    theme = colorScheme || 'dark';
  }

  return (
    <>
      <List.Item
        title={title}
        description={description}
        descriptionNumberOfLines={4}
        right={props => (
          <Ionicons
            name={'chevron-forward-outline'}
            size={20}
            color={theme === 'dark' ? '#fff' : '#333'}
          />
        )}
        onPress={handlePress}
      />
      <Divider />
    </>
  );
};

export default SettingItem;
