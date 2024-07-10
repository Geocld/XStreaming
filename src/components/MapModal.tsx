import React from 'react';
import {StyleSheet, ScrollView, View, NativeEventEmitter} from 'react-native';
import {Modal, Card, Text, Radio, RadioGroup} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';
import {SvgXml} from 'react-native-svg';
import maping from '../common/svg';

type Props = {
  show: boolean;
  current: string;
  currentMode: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

const MapModal: React.FC<Props> = ({show, current, onSelect, onClose}) => {
  const {t} = useTranslation();

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <Text category="h6" style={styles.text}>
          {t('Key Maping')}
        </Text>
        <ScrollView>
          <Text style={styles.text}>
            {t(
              'Please press the button on the controller, which will be mapped to:',
            )}
          </Text>
          <View style={styles.flex}>
            <SvgXml xml={maping[current]} width="50" height="50" />
          </View>
          <Text style={styles.text}>
            {t(
              'After successful mapping, this pop-up will automatically close',
            )}
          </Text>
        </ScrollView>
      </Card>
    </Modal>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: '#fff',
  },
  text: {
    color: '#333',
    marginTop: 10,
    marginBottom: 10,
  },
  flex: {
    flex: 1,
    alignItems: 'center',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

export default MapModal;
