import i18next from '../../i18n';

const {t} = i18next;

const sensor = [
  {
    name: 'gyroscope',
    type: 'radio',
    title: t('gyroTitle'),
    description: t('gyroDesc'),
    tips: t('gyroTips'),
    data: [
      {value: true, text: t('Enable')},
      {value: false, text: t('Disable')},
    ],
  },
  {
    name: 'gyroscope_sensitivity',
    type: 'slider',
    min: 100,
    max: 30000,
    step: 100,
    title: t('gyroSenTitle'),
    description: t('gyroSenDesc'),
    data: [],
  },
];

export default sensor;
