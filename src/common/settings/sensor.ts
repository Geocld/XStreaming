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
    name: 'sensor_type',
    type: 'radio',
    title: t('gyroTypeTitle'),
    description: t('gyroTypeDesc'),
    data: [
      {value: 1, text: t('LT press')},
      {value: 2, text: t('LB press')},
      {value: 3, text: t('Global')},
    ],
  },
  {
    name: 'sensor_sensitivity_x',
    type: 'slider',
    min: 100,
    max: 30000,
    step: 100,
    title: t('gyroSenTitleX'),
    description: t('gyroSenDescX'),
    data: [],
  },
  {
    name: 'sensor_sensitivity_y',
    type: 'slider',
    min: 100,
    max: 30000,
    step: 100,
    title: t('gyroSenTitleY'),
    description: t('gyroSenDescY'),
    data: [],
  },
  {
    name: 'sensor_invert',
    type: 'radio',
    title: t('sensorInvertTitle'),
    description: t('sensorInvertDesc'),
    data: [
      {value: 0, text: t('Disable')},
      {value: 1, text: t('x_axies')},
      {value: 2, text: t('y_axies')},
      {value: 3, text: t('all_axies')},
    ],
  },
];

export default sensor;
