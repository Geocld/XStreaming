import React from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {Text, Button} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';

type Props = {
  options: any;
  onChange: (value: any) => {};
};
const defaultValue = {
  sharpness: 5,
  saturation: 100,
  contrast: 100,
  brightness: 100,
};

const Display: React.FC<Props> = ({options, onChange}) => {
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
    setInnerOptions(innerOptions);
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
            <Text variant="titleMedium">
              {innerOptions.sharpness === 0
                ? t('Close')
                : innerOptions.sharpness}
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          value={innerOptions.sharpness}
          minimumValue={0}
          maximumValue={10}
          step={1}
          onValueChange={val => {
            handleValChange('sharpness', val);
          }}
          lowerLimit={0}
          minimumTrackTintColor="#107C10"
          maximumTrackTintColor="grey"
        />
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <View style={styles.titleLeft}>
            <Text variant="titleMedium">{t('Saturation')}</Text>
          </View>
          <View style={styles.titleRight}>
            <Text variant="titleMedium">{innerOptions.saturation}%</Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          value={innerOptions.saturation}
          minimumValue={50}
          maximumValue={150}
          step={10}
          onValueChange={val => {
            handleValChange('saturation', val);
          }}
          lowerLimit={0}
          minimumTrackTintColor="#107C10"
          maximumTrackTintColor="grey"
        />
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <View style={styles.titleLeft}>
            <Text variant="titleMedium">{t('Contrast')}</Text>
          </View>
          <View style={styles.titleRight}>
            <Text variant="titleMedium">{innerOptions.contrast}%</Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          value={innerOptions.contrast}
          minimumValue={50}
          maximumValue={150}
          step={10}
          onValueChange={val => {
            handleValChange('contrast', val);
          }}
          lowerLimit={0}
          minimumTrackTintColor="#107C10"
          maximumTrackTintColor="grey"
        />
      </View>

      <View style={styles.block}>
        <View style={styles.title}>
          <View style={styles.titleLeft}>
            <Text variant="titleMedium">{t('Brightness')}</Text>
          </View>
          <View style={styles.titleRight}>
            <Text variant="titleMedium">{innerOptions.brightness}%</Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          value={innerOptions.brightness}
          minimumValue={50}
          maximumValue={150}
          step={10}
          onValueChange={val => {
            handleValChange('brightness', val);
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
  container: {
    paddingTop: 30,
    padding: 10,
  },
  block: {
    marginBottom: 10,
  },
  title: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleLeft: {},
  titleRight: {},
  slider: {
    marginTop: 20,
  },
});

export default Display;
