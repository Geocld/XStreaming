import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text, IconButton} from 'react-native-paper';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';

type Props = {
  value: any;
  onChange: (value: any) => {};
};

const Audio: React.FC<Props> = ({value, onChange}) => {
  const {t} = useTranslation();

  const handleValChange = (val: string | number) => {
    onChange && onChange(val);
  };

  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <View style={styles.title}>
          <View style={styles.titleLeft}>
            <Text variant="titleMedium">{t('Volume')}</Text>
          </View>
          <View style={styles.titleRight}>
            <IconButton
              icon="minus"
              size={20}
              onPress={() => {
                if (value > 0) {
                  onChange && onChange(value - 1);
                }
              }}
            />
            <IconButton
              icon="plus"
              size={20}
              onPress={() => {
                if (value < 10) {
                  onChange && onChange(value + 1);
                }
              }}
            />
          </View>
        </View>
        <Slider
          style={styles.slider}
          value={value}
          minimumValue={0}
          maximumValue={10}
          step={1}
          onValueChange={val => {
            handleValChange(val);
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

export default Audio;
