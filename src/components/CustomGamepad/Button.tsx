import React from 'react';
import {View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import icons from '../../common/virtualgp';

type Props = {
  name: string;
  width: number;
  height: number;
  scale: number;
  style?: any;
};

const GamepadButton: React.FC<Props> = ({
  name,
  width = 40,
  height = 40,
  scale = 1,
  style,
}) => {
  return (
    <View style={style}>
      <SvgXml xml={icons[name]} width={width * scale} height={height * scale} />
    </View>
  );
};

export default GamepadButton;
