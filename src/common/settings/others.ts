import i18next from '../../i18n';

const {t} = i18next;

const others = [
  {
    name: 'native_touch',
    type: 'radio',
    title: t('Native touch'),
    description: t('Enable native touch input'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'check_update',
    type: 'radio',
    title: t('Auto check update'),
    description: t('Whether check XStreaming updates automatically'),
    data: [
      {value: true, text: t('Enable')},
      {value: false, text: t('Disable')},
    ],
  },
];

export default others;
