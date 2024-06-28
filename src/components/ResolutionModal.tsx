import React from 'react';
import {StyleSheet} from 'react-native';
import {Modal, Card, Text, Radio, RadioGroup} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  current: number | undefined;
  onSelect: (value: number) => void;
  onClose: () => void;
};

const data = [
  {value: 720, text: '720P'},
  {value: 1080, text: '1080P'},
];

const ResolutionModal: React.FC<Props> = ({
  show,
  current,
  onSelect,
  onClose,
}) => {
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
        <Text category="h6">{t('Resolution')}</Text>
        <RadioGroup
          selectedIndex={selectedIndex}
          onChange={index => handleSelect(index)}>
          {data.map(d => (
            <Radio key={d.value}>{d.text}</Radio>
          ))}
        </RadioGroup>
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

export default ResolutionModal;
