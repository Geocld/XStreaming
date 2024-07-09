import React from 'react';
import {StyleSheet, View} from 'react-native';
import {
  Modal,
  Card,
  Text,
  Divider,
  Radio,
  RadioGroup,
} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  current: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
};

const GamepadKernalModal: React.FC<Props> = ({
  show,
  current,
  onSelect,
  onClose,
}) => {
  const {t} = useTranslation();

  const data = [
    {value: 'Native', text: t('Native')},
    {value: 'Web', text: t('Web')},
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
        <Text category="h6" style={styles.title}>
          {t('Gamepad kernal')}
        </Text>
        <Divider />
        <View style={styles.content}>
          <RadioGroup
            selectedIndex={selectedIndex}
            onChange={index => handleSelect(index)}>
            {data.map(d => (
              <Radio key={d.value}>{d.text}</Radio>
            ))}
          </RadioGroup>
        </View>
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
  title: {
    paddingBottom: 10,
  },
  content: {
    paddingTop: 10,
  },
});

export default GamepadKernalModal;
