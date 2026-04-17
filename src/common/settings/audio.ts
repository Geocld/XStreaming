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
    name: 'enable_stereo_audio',
    type: 'radio',
    title: t('Audio_stereo_title'),
    description: t('Audio_stereo_desc'),
    data: [
      {value: true, text: t('Enable')},
      {value: false, text: t('Disable')},
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
  {
    name: 'enable_audio_rumble',
    type: 'radio',
    title: t('Audio_rumble_title'),
    description: t('Audio_rumble_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'audio_rumble_threshold',
    type: 'slider',
    min: 10,
    max: 100,
    step: 1,
    title: t('Audio_rumble_threshold_title'),
    description: t('Audio_rumble_threshold_desc'),
    data: [],
  },
  {
    name: 'enable_microphone',
    type: 'radio',
    title: t('Microphone_title'),
    description: t('Microphone_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
];

export default audio;
