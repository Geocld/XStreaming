import i18next from '../../i18n';

const {t} = i18next;

const display = [
  {
    name: 'resolution',
    type: 'radio',
    title: t('Resolution'),
    description: t('Set resolution, support 720P/1080P/1080P(HQ)'),
    tips: t('resolutionTips'),
    data: [
      {value: 720, text: '720P'},
      {value: 1080, text: '1080P'},
      {value: 1081, text: '1080P(HQ)/1440P'},
    ],
  },
  {
    name: 'video_format',
    type: 'radio',
    title: t('Video stream format'),
    description: t(
      'Select video stream format, if you want video fullscreen, please select Stretch or Zoom',
    ),
    tips: t(
      'In Native mode, only scaling can be set for the rendering engine.',
    ),
    data: [
      {value: '', text: t('Aspect ratio')},
      {value: 'Stretch', text: t('Stretch')},
      {value: 'Zoom', text: t('Zoom')},
      {value: '16:10', text: '16:10'},
      {value: '18:9', text: '18:9'},
      {value: '21:9', text: '21:9'},
      {value: '4:3', text: '4:3'},
    ],
  },
  {
    name: 'xhome_bitrate_mode',
    type: 'radio',
    title: t('Host stream bitrate'),
    description: t(
      'Set the host streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)',
    ),
    data: [
      {value: 'auto', text: t('Auto')},
      {value: 'custom', text: t('Custom')},
    ],
  },
  {
    name: 'xcloud_bitrate_mode',
    type: 'radio',
    title: t('Cloud stream bitrate'),
    description: t(
      'Set the cloud streaming bitrate (Note: Higher bitrate is not always better; the final bitrate will be determined by streaming negotiation)',
    ),
    data: [
      {value: 'auto', text: t('Auto')},
      {value: 'custom', text: t('Custom')},
    ],
  },
  {
    name: 'codec',
    type: 'radio',
    title: t('Codec'),
    description: t(
      'If your device supports newer codecs, it can reduce the video bandwidth requirements',
    ),
    data: [
      {value: '', text: 'Auto'},
      // {value: 'video/AV1', text: 'AV1'},
      // {value: 'video/VP9', text: 'VP9'},
      // {value: '', text: 'H265'},
      // {value: 'video/VP8', text: 'VP8'},
      {value: 'video/H264-4d', text: 'H264-High'},
      {value: 'video/H264-42e', text: 'H264-Medium'},
      {value: 'video/H264-420', text: 'H264-Low'},
      // {value: 'video/flexfec-03', text: 'flexfec-03'},
      // {value: 'video/ulpfec', text: 'ulpfec'},
      // {value: 'video/rtx', text: 'rtx'},
      // {value: 'video/red', text: 'red'},
    ],
  },
  {
    name: 'fsr',
    type: 'radio',
    title: t('FSR'),
    description: t('FSR_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'fsr_sharpness',
    type: 'slider',
    min: 0,
    max: 10,
    step: 1,
    title: t('fsr_sharpness_title'),
    description: t('fsr_sharpness_desc'),
    data: [],
  },
  {
    name: 'show_performance',
    type: 'radio',
    title: t('Show performance'),
    description: t('Always display the performance panel'),
    data: [
      {value: true, text: t('Enable')},
      {value: false, text: t('Disable')},
    ],
  },
  {
    name: 'performance_style',
    type: 'radio',
    title: t('Performance show style'),
    description: t('Setting performance show style'),
    data: [
      {value: true, text: t('Horizon')},
      {value: false, text: t('Vertical')},
    ],
  },
  {
    name: 'show_menu',
    type: 'radio',
    title: t('show_menu_title'),
    description: t('show_menu_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
];

export default display;
