import React from 'react';
import {StyleSheet, ScrollView} from 'react-native';
import {Modal, Card, Text, Radio, RadioGroup} from '@ui-kitten/components';
import {useTranslation} from 'react-i18next';
import {useSelector} from 'react-redux';

type Props = {
  show: boolean;
  onSelect: () => void;
  onClose: () => void;
};

const SingnalModal: React.FC<Props> = ({show, onSelect, onClose}) => {
  const {t} = useTranslation();

  const streamingTokens = useSelector((state: any) => state.streamingTokens);
  const regions = streamingTokens.xHomeToken.getRegions() || [];

  const handleClose = () => {
    onClose();
  };

  const handleSelect = (idx: number) => {
    regions.forEach((region: any, i: number) => {
      if (idx === i) {
        region.isDefault = true;
      } else {
        region.isDefault = false;
      }
    });
    onSelect();
  };

  let selectedIndex = 0;
  regions.forEach((region: any, idx: number) => {
    if (region.isDefault) {
      selectedIndex = idx;
    }
  });

  return (
    <Modal
      visible={show}
      backdropStyle={styles.backdrop}
      onBackdropPress={() => handleClose()}>
      <Card disabled={true} style={styles.card}>
        <Text category="h6">{t('Signal server')}</Text>
        <ScrollView>
          <RadioGroup
            selectedIndex={selectedIndex}
            onChange={index => handleSelect(index)}>
            {regions.map((region: any) => (
              <Radio key={region.name}>{region.name}</Radio>
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

export default SingnalModal;
