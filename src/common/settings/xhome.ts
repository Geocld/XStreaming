import i18next from '../../i18n';

const {t} = i18next;

const xhome = [
  {
    name: 'power_on',
    type: 'radio',
    title: t('Power on when streaming'),
    description: t('power_on_description'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'ipv6',
    type: 'radio',
    title: t('Ipv6'),
    description: t('Prioritize using IPv6 connection'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'signaling_home',
    type: 'radio',
    title: t('Signal server') + '(xHome)',
    description: t(
      'The signaling server is a server for stream negotiation. If the host cannot connect, please try modifying this option',
    ),
    data: [],
  },
];

export default xhome;
