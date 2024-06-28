import React from 'react';
import {StyleSheet, ScrollView} from 'react-native';
import {Modal, Card, Text, Radio, RadioGroup} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  current: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

const RegionModal: React.FC<Props> = ({show, current, onSelect, onClose}) => {
  const {t} = useTranslation();

  const data = [
    {value: '', text: t('Default')},
    {value: '203.41.44.20', text: t('Australia')},
    {value: '200.221.11.101', text: t('Brazil')},
    {value: '194.25.0.68', text: t('Europe')},
    {value: '210.131.113.123', text: t('Japan')},
    {value: '168.126.63.1', text: t('Korea')},
    {value: '4.2.2.2', text: t('United States')},
  ];

  const handleClose = () => {
    onClose();
  };

  const handleSelect = (idx: number) => {
    onSelect(data[idx].value);
  };

  let selectedIndex = 0;
  data.forEach((d, idx) => {
    if (d.value === current) {
      selectedIndex = idx;
    }
  });

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <Text category="h6">{t('Set region')}</Text>
        <ScrollView>
          <RadioGroup
            selectedIndex={selectedIndex}
            onChange={index => handleSelect(index)}>
            {data.map(d => (
              <Radio key={d.value}>{`${d.text} ${
                d.value ? `(${d.value})` : ''
              }`}</Radio>
            ))}
          </RadioGroup>
        </ScrollView>
      </Card>
    </Modal>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 300,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

export default RegionModal;
