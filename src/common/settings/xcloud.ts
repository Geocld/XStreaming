import i18next from '../../i18n';

const {t} = i18next;

export const xcloudRegionFlags: Record<string, string> = {
  '203.41.44.20': '🇦🇺',
  '200.221.11.101': '🇧🇷',
  '169.150.198.66': '🇧🇷',
  '194.25.0.68': '🇪🇺',
  '104.211.224.146': '🇮🇳',
  '104.211.96.159': '🇮🇳',
  '138.199.21.239': '🇯🇵',
  '210.131.113.123': '🇯🇵',
  '168.126.63.1': '🇰🇷',
  '121.125.60.151': '🇰🇷',
  '4.2.2.2': '🇺🇸',
  '143.244.47.65': '🇺🇸',
  '45.134.212.66': '🇵🇱',
};

export const getXcloudRegionFlag = (regionIp?: string) => {
  if (!regionIp) {
    return '';
  }
  return xcloudRegionFlags[regionIp] || '';
};

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
      {value: '200.221.11.101', text: t('Brazil1')},
      {value: '169.150.198.66', text: t('Brazil2')},
      {value: '194.25.0.68', text: t('Europe')},
      {value: '104.211.224.146', text: t('South India')},
      {value: '104.211.96.159', text: t('Central India')},
      {value: '138.199.21.239', text: t('Japan1')},
      {value: '210.131.113.123', text: t('Japan2')},
      {value: '168.126.63.1', text: t('Korea1')},
      {value: '121.125.60.151', text: t('Korea2')},
      {value: '4.2.2.2', text: t('United States1')},
      {value: '143.244.47.65', text: t('United States2')},
      {value: '45.134.212.66', text: t('Poland')},
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
