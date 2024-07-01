import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Modal, Card, Text, Button} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';

type Props = {
  show: boolean;
  onConfirm: (mode: string) => void;
  onClose: () => void;
};

const LinkModeModal: React.FC<Props> = ({show, onConfirm, onClose}) => {
  const {t} = useTranslation();

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = (mode: string) => {
    onConfirm(mode);
  };

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <View style={{marginBottom: 20}}>
          <Button onPress={() => handleConfirm('local')}>
            {t('Local connect')}
          </Button>
        </View>

        <View>
          <Button onPress={() => handleConfirm('remote')}>
            {t('Remote connect')}
          </Button>
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
});

export default LinkModeModal;
