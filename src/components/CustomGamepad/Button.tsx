import React from 'react';
import {View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import icons from '../../common/virtualgp';

type Props = {
  name: string;
  width: number;
  height: number;
  style?: any;
};

const GamepadButton: React.FC<Props> = ({
  name,
  width = 40,
  height = 40,
  style,
}) => {
  return (
    <View style={style}>
      <SvgXml xml={icons[name]} width={width} height={height} />
    </View>
  );
};

export default GamepadButton;
