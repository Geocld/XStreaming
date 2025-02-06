import i18next from '../../i18n';

const {t} = i18next;

const sensor = [
  {
    name: 'sensor',
    type: 'radio',
    title: t('gyroTitle'),
    description: t('gyroDesc'),
    tips: t('gyroTips'),
    data: [
      {value: 0, text: t('Disable')},
      {value: 1, text: t('Device')},
      {value: 2, text: t('Controller')},
    ],
  },
  {
    name: 'sensor_sensitivity',
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
