import React from 'react';
import {StyleSheet} from 'react-native';
import {
  Modal,
  Card,
  Text,
  Button,
  Radio,
  RadioGroup,
} from '@ui-kitten/components';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  isCloud: boolean;
  currentMode: string;
  currentValue: number;
  onConfirm: (mode: string, value: number) => void;
  onClose: () => void;
};

const BitrateModal: React.FC<Props> = ({
  show,
  isCloud,
  currentMode,
  currentValue,
  onConfirm,
  onClose,
}) => {
  const {t} = useTranslation();
  const [value, setValue] = React.useState(currentValue ?? 10);
  const [mode, setMode] = React.useState(currentMode ?? 'auto');
  const [idx, setIdx] = React.useState(currentMode === 'auto' ? 0 : 1);

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(mode, value);
  };

  const data = [
    {value: 'auto', text: t('Auto')},
    {value: 'custom', text: t('Custom')},
  ];

  const handleSelect = (i: number) => {
    setIdx(i);
    setMode(data[i].value);
  };

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <Text category="h6">
          {isCloud ? t('Xcloud') : t('Host')} {t('bitrate')}
        </Text>
        <RadioGroup selectedIndex={idx} onChange={index => handleSelect(index)}>
          {data.map(d => (
            <Radio key={d.value}>{d.text}</Radio>
          ))}
        </RadioGroup>
        {mode === 'custom' && (
          <>
            <Text>
              {t('Current')}: {value} Mbps
            </Text>
            <Slider
              style={{width: '100%', height: 40}}
              value={value}
              minimumValue={1}
              maximumValue={150}
              step={1}
              onValueChange={setValue}
              lowerLimit={1}
              minimumTrackTintColor="#107C10"
              maximumTrackTintColor="grey"
            />
          </>
        )}

        <Button size="small" onPress={handleConfirm}>
          {t('Confirm')}
        </Button>
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

export default BitrateModal;
