import {getSettings, saveSettings, Settings} from '../store/settingStore';

export const CLOUD_TO_IP_MAP: Record<string, string> = {
  KoreaCentral: '168.126.63.1',
  JapanEast: '138.199.21.239',
  AustraliaEast: '203.41.44.20',
  SoutheastAsia: '104.211.96.159',
  WestUS2: '4.2.2.2',
  WestUS: '4.2.2.2',
  EastUS: '143.244.47.65',
  EastUS2: '143.244.47.65',
  SouthCentralUS: '4.2.2.2',
  NorthCentralUS: '4.2.2.2',
  WestEurope: '194.25.0.68',
  NorthEurope: '194.25.0.68',
  UnitedKingdom: '194.25.0.68',
  UK: '194.25.0.68',
  BrazilSouth: '200.221.11.101',
  CentralIndia: '104.211.96.159',
  India: '104.211.96.159',
  Poland: '45.134.212.66',
};

export const IP_TO_CLOUD_MAP: Record<string, string> = {
  '168.126.63.1': 'KoreaCentral',
  '121.125.60.151': 'KoreaCentral',
  '138.199.21.239': 'JapanEast',
  '210.131.113.123': 'JapanEast',
  '203.41.44.20': 'AustraliaEast',
  '104.211.96.159': 'CentralIndia',
  '104.211.224.146': 'CentralIndia',
  '4.2.2.2': 'WestUS2',
  '143.244.47.65': 'EastUS',
  '194.25.0.68': 'WestEurope',
  '200.221.11.101': 'BrazilSouth',
  '169.150.198.66': 'BrazilSouth',
  '45.134.212.66': 'WestEurope',
};

/**
 * Get matching force_region_ip from server cloud region name
 */
export const getRegionIpForCloudName = (cloudName: string): string => {
  if (!cloudName) return '';
  if (CLOUD_TO_IP_MAP[cloudName]) {
    return CLOUD_TO_IP_MAP[cloudName];
  }

  const lower = cloudName.toLowerCase();
  if (lower.includes('korea')) return '168.126.63.1';
  if (lower.includes('japan')) return '138.199.21.239';
  if (lower.includes('australia')) return '203.41.44.20';
  if (lower.includes('india')) return '104.211.96.159';
  if (lower.includes('brazil')) return '200.221.11.101';
  if (lower.includes('europe') || lower.includes('uk')) return '194.25.0.68';
  if (lower.includes('us')) return '4.2.2.2';
  return '';
};

/**
 * Get matching server cloud name from force_region_ip
 */
export const getCloudNameForRegionIp = (regionIp: string): string => {
  if (!regionIp) return '';
  if (IP_TO_CLOUD_MAP[regionIp]) {
    return IP_TO_CLOUD_MAP[regionIp];
  }
  return '';
};

/**
 * Synchronize both signaling_cloud_name and force_region_ip settings
 */
export const syncRegionSettings = (
  value: string,
  source: 'cloud' | 'ip',
): Settings => {
  const currentSettings = getSettings();

  if (source === 'cloud') {
    currentSettings.signaling_cloud_name = value;
    const matchingIp = getRegionIpForCloudName(value);
    if (matchingIp) {
      currentSettings.force_region_ip = matchingIp;
    }
  } else {
    currentSettings.force_region_ip = value;
    const matchingCloud = getCloudNameForRegionIp(value);
    if (matchingCloud) {
      currentSettings.signaling_cloud_name = matchingCloud;
    }
  }

  saveSettings(currentSettings);
  return currentSettings;
};
