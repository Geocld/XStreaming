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

const data = [
  {value: 'en', text: 'English'},
  {value: 'zh', text: '简体中文'},
];

const LocaleModal: React.FC<Props> = ({show, current, onSelect, onClose}) => {
  const {t} = useTranslation();
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
        <Text category="h6">{t('App language')}</Text>
        <ScrollView>
          <RadioGroup
            selectedIndex={selectedIndex}
            onChange={index => handleSelect(index)}>
            {data.map(d => (
              <Radio key={d.value}>{`${d.text}`}</Radio>
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
    maxHeight: 500,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

export default LocaleModal;
