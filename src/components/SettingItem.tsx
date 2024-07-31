import React from 'react';
import {List} from 'react-native-paper';
import Ionicons from 'react-native-vector-icons/Ionicons';

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
    <List.Item
      title={title}
      description={description}
      right={props => (
        <Ionicons name={'chevron-forward-outline'} size={20} color={'#fff'} />
      )}
      onPress={handlePress}
    />
  );
};

export default SettingItem;
