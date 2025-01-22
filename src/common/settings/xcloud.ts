import i18next from '../../i18n';

const {t} = i18next;

const xcloud = [
  {
    name: 'force_region_ip',
    type: 'radio',
    title: t('Set region'),
    description: t(
      'Changing the region allows you to use XGPU services without a proxy',
    ),
    data: [
      {value: '', text: t('Default')},
      {value: '203.41.44.20', text: t('Australia')},
      {value: '200.221.11.101', text: t('Brazil')},
      {value: '194.25.0.68', text: t('Europe')},
      {value: '210.131.113.123', text: t('Japan')},
      {value: '168.126.63.1', text: t('Korea')},
      {value: '4.2.2.2', text: t('United States')},
    ],
  },
  {
    name: 'signaling_cloud',
    type: 'radio',
    title: t('Signal server') + '(xCloud)',
    description: t(
      'The signaling server is a server for stream negotiation. If the host cannot connect, please try modifying this option',
    ),
    data: [],
  },
];

export default xcloud;
