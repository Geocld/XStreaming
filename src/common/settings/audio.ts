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
    name: 'audio_volume',
    type: 'slider',
    title: t('Audio_volume_title'),
    description: t('Audio_volume_desc'),
    min: 1,
    max: 10,
    step: 1,
    data: [],
  },
];

export default audio;
