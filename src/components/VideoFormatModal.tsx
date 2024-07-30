import React from 'react';
import {StyleSheet} from 'react-native';
import {Modal, Card, Text, Radio, RadioGroup} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  current: number | undefined;
  onSelect: (value: string) => void;
  onClose: () => void;
};

const VideoFormatModal: React.FC<Props> = ({
  show,
  current,
  onSelect,
  onClose,
}) => {
  const {t} = useTranslation();

  const data = [
    {value: '', text: t('Aspect ratio')},
    {value: 'Stretch', text: t('Stretch')},
    {value: 'Zoom', text: t('Zoom')},
  ];

  const handleClose = () => {
    onClose();
  };

  const handleSelect = (idx: number) => {
    onSelect(data[idx].value);
  };

  let selectedIndex = 0;
  data.forEach((d: any, idx) => {
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
        <Text category="h6">{t('Video stream format')}</Text>
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

export default VideoFormatModal;
