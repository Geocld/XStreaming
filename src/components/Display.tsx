import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text, IconButton} from 'react-native-paper';
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
            <Text variant="titleMedium">
              {innerOptions.sharpness === 0
                ? t('Close')
                : innerOptions.sharpness}
            </Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => {
                if (innerOptions.sharpness < 10) {
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
            <IconButton
              icon="minus"
              size={20}
              onPress={() => {
                if (innerOptions.saturation > 50) {
                  innerOptions.saturation = innerOptions.saturation - 10;
                  setInnerOptions(() => ({
                    ...innerOptions,
                  }));
                  onChange && onChange(innerOptions);
                }
              }}
            />
            <Text variant="titleMedium">{innerOptions.saturation}%</Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => {
                if (innerOptions.saturation < 150) {
                  innerOptions.saturation = innerOptions.saturation + 10;
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
            <IconButton
              icon="minus"
              size={20}
              onPress={() => {
                if (innerOptions.contrast > 50) {
                  innerOptions.contrast = innerOptions.contrast - 10;
                  setInnerOptions(() => ({
                    ...innerOptions,
                  }));
                  onChange && onChange(innerOptions);
                }
              }}
            />
            <Text variant="titleMedium">{innerOptions.contrast}%</Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => {
                if (innerOptions.contrast < 150) {
                  innerOptions.contrast = innerOptions.contrast + 10;
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
            <IconButton
              icon="minus"
              size={20}
              onPress={() => {
                if (innerOptions.brightness > 50) {
                  innerOptions.brightness = innerOptions.brightness - 10;
                  setInnerOptions(() => ({
                    ...innerOptions,
                  }));
                  onChange && onChange(innerOptions);
                }
              }}
            />
            <Text variant="titleMedium">{innerOptions.brightness}%</Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => {
                if (innerOptions.brightness < 150) {
                  innerOptions.brightness = innerOptions.brightness + 10;
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

export default Display;
