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
  onSelect: (check: boolean) => void;
  onClose: () => void;
};

const data = [
  {value: 0, text: 'Webview'},
  {value: 1, text: 'Native'},
];

const VibrationModeModal: React.FC<Props> = ({
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
    onSelect(data[idx].value === 1 ? true : false);
  };

  let selectedIndex = 0;
  if (current) {
    selectedIndex = 1;
  }

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <Text category="h6" style={styles.title}>
          {t('Vibration mode')}
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

export default VibrationModeModal;
