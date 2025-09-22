import i18next from '../../i18n';

const {t} = i18next;

const server = [
  {
    name: 'use_inner_turn_server',
    type: 'radio',
    title: t('inner_server_title'),
    description: t('inner_server_desc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
];

export default server;
