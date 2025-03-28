import i18next from '../../i18n';

const {t} = i18next;

const audio = [
  {
    name: 'audio_bitrate_mode',
    type: 'radio',
    title: t('Audio bitrate'),
    description: t('Set the streaming audio bitrate'),
    data: [
      {value: 'auto', text: t('Auto')},
      {value: 'custom', text: t('Custom')},
    ],
  },
  {
    name: 'enable_audio_control',
    type: 'radio',
    title: t('Audio_volume_title'),
    description: t('Audio_volume_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
];

export default audio;
