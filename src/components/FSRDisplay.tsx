import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text, IconButton} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';

type Props = {
  options: any;
  onChange: (value: any) => any;
};
const defaultValue = {
  sharpness: 2,
};

const FSRDisplay: React.FC<Props> = ({options, onChange}) => {
  const {t} = useTranslation();
  const [innerOptions, setInnerOptions] = React.useState<any>(defaultValue);

  React.useEffect(() => {
    try {
      setInnerOptions(JSON.parse(JSON.stringify(options)));
    } catch (e) {
      setInnerOptions(defaultValue);
    }
  }, [options]);

  const handleValChange = (key: string, value: string | number) => {
    innerOptions[key] = value;
    setInnerOptions(() => ({
      ...innerOptions,
    }));
    onChange && onChange(innerOptions);
  };

  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <View style={styles.titleLeft}>
            <Text variant="titleMedium">{t('Sharpness')}</Text>
          </View>
          <View style={styles.titleRight}>
            <IconButton
              icon="minus"
              size={20}
              onPress={() => {
                if (innerOptions.sharpness > 0) {
                  innerOptions.sharpness = innerOptions.sharpness - 1;
                  setInnerOptions(() => ({
                    ...innerOptions,
                  }));
                  onChange && onChange(innerOptions);
                }
              }}
            />
            <Text variant="titleMedium">{innerOptions.sharpness}</Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => {
                if (innerOptions.sharpness < 20) {
                  innerOptions.sharpness = innerOptions.sharpness + 1;
                  setInnerOptions(() => ({
                    ...innerOptions,
                  }));
                  onChange && onChange(innerOptions);
                }
              }}
            />
          </View>
        </View>
        <Slider
          style={styles.slider}
          value={innerOptions.sharpness}
          minimumValue={0}
          maximumValue={20}
          step={1}
          onValueChange={val => {
            handleValChange('sharpness', val);
          }}
          lowerLimit={0}
          minimumTrackTintColor="#107C10"
          maximumTrackTintColor="grey"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  block: {
    marginBottom: 10,
  },
  title: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleLeft: {},
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slider: {
    marginTop: 10,
  },
});

export default FSRDisplay;
