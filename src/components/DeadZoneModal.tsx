import React from 'react';
import {StyleSheet} from 'react-native';
import {Modal, Card, Text, Button} from '@ui-kitten/components';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  current: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
};

const DeadZoneModal: React.FC<Props> = ({
  show,
  current,
  onConfirm,
  onClose,
}) => {
  const {t} = useTranslation();
  const [value, setValue] = React.useState(current ?? 0.2);

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(value);
  };

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <Text category="h6">{t('Joystick dead zone')}</Text>
        <>
          <Text>
            {t('Current')}: {value}
          </Text>
          <Slider
            style={{width: '100%', height: 40}}
            value={value}
            minimumValue={0.1}
            maximumValue={0.9}
            step={0.01}
            onValueChange={val => {
              setValue(parseFloat(val.toFixed(2)));
            }}
            lowerLimit={0.1}
            minimumTrackTintColor="#107C10"
            maximumTrackTintColor="grey"
          />
        </>

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

export default DeadZoneModal;
