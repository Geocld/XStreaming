import i18next from '../../i18n';

const {t} = i18next;

const others = [
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
