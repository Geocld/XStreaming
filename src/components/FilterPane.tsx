import React from 'react';
import {StyleSheet, View, useColorScheme} from 'react-native';
import {Card, Text} from 'react-native-paper';
import {SvgXml} from 'react-native-svg';
import maping from '../common/svg';
import {getSettings} from '../store/settingStore';

type Options = {
    sharpness: number,
    saturation: number,
    contrast: number,
    brightness: number,
}

type Props = {
  onChange: (options: Options) => {};
};

const FilterPane: React.FC<Props> = ({options}) => {
  const colorScheme = useColorScheme();
  const settings = getSettings();
  const [ops, setOps] = React.useState<any>({})

  const handleChange = (name: string, value: number) => {
    ops[name] = value;
    setOps(ops)
  };

  return (
    <Card>
      <Card.Content>
        <View style={styles.flex}>
          <Text style={styles.text}>TODO</Text>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    alignItems: 'center',
  },
  text: {
    color: '#666',
  },
});

export default FilterPane;
