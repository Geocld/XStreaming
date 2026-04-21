import React from 'react';
import {View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {useTheme} from 'react-native-paper';
import icons from '../../common/virtualgp';
import {VIRTUAL_MACRO_BUTTON_NAME} from '../../utils/virtualMacro';
import {colorizeMacroIconXml, normalizeHexColor} from '../../utils/themeColor';

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
  const theme = useTheme();
  const primaryColor = normalizeHexColor(theme.colors.primary);
  if (['A', 'B', 'X', 'Y'].indexOf(name) > -1) {
    width = 100;
    height = 100;
  }
  if (name.indexOf('DPad') > -1) {
    width = 70;
    height = 70;
  }
  if (name === VIRTUAL_MACRO_BUTTON_NAME) {
    width = 80;
    height = 80;
  }

  return (
    <View style={style}>
      <SvgXml
        xml={
          name === VIRTUAL_MACRO_BUTTON_NAME
            ? colorizeMacroIconXml(icons[name], primaryColor)
            : icons[name]
        }
        width={width * scale}
        height={height * scale}
      />
    </View>
  );
};

export default GamepadButton;
