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
  {value: '', text: 'Default'},
  {value: 'ar-SA', text: 'Arabic (Saudi Arabia)'},
  {value: 'cs-CZ', text: 'Czech'},
  {value: 'da-DK', text: 'Danish'},
  {value: 'de-DE', text: 'German'},
  {value: 'el-GR', text: 'Greek'},
  {value: 'en-GB', text: 'English (United Kingdom)'},
  {value: 'en-US', text: 'English (United States)'},
  {value: 'es-ES', text: 'Spanish (Spain)'},
  {value: 'es-MX', text: 'Spanish (Mexico)'},
  {value: 'fi-FI', text: 'Swedish'},
  {value: 'fr-FR', text: 'French'},
  {value: 'he-IL', text: 'Hebrew'},
  {value: 'hu-HU', text: 'Hungarian'},
  {value: 'it-IT', text: 'Italian'},
  {value: 'ja-JP', text: 'Japanese'},
  {value: 'ko-KR', text: 'Korean'},
  {value: 'nb-NO', text: 'Norwegian'},
  {value: 'nl-NL', text: 'Dutch'},
  {value: 'pl-PL', text: 'Polish'},
  {value: 'pt-BR', text: 'Portuguese (Brazil)'},
  {value: 'pt-PT', text: 'Portuguese (Portugal)'},
  {value: 'ru-RU', text: 'Russian'},
  {value: 'sk-SK', text: 'Slovak'},
  {value: 'sv-SE', text: 'Swedish'},
  {value: 'tr-TR', text: 'Turkish'},
  {value: 'zh-CN', text: '简体中文'},
  {value: 'zh-TW', text: '繁体中文'},
];

const GameLangModal: React.FC<Props> = ({show, current, onSelect, onClose}) => {
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
        <Text category="h6">{t('Preferred language of game')}</Text>
        <ScrollView>
          <RadioGroup
            selectedIndex={selectedIndex}
            onChange={index => handleSelect(index)}>
            {data.map(d => (
              <Radio key={d.value}>{`${d.text} ${
                d.value ? `(${d.value})` : ''
              }`}</Radio>
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

export default GameLangModal;
