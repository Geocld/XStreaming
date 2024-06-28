// import AsyncStorage from '@react-native-async-storage/async-storage';
import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('settingStore');

const STORE_KEY = 'user.settings';

export type Settings = {
  locale: string;
  resolution: number;
  xhome_bitrate_mode: string;
  xhome_bitrate: number | string;
  xcloud_bitrate_mode: string;
  xcloud_bitrate: number | string;
  preferred_game_language: string;
  force_region_ip: string;
  codec: string;
  vibration: boolean;
  native_vibration: boolean;
  dead_zone: number;
  gamepad_maping: Record<string, number> | null;
  debug: boolean;
};

const defaultSettings: Settings = {
  locale: 'en',
  resolution: 720,
  xhome_bitrate_mode: 'auto',
  xhome_bitrate: 1024,
  xcloud_bitrate_mode: 'auto',
  xcloud_bitrate: 1024,
  preferred_game_language: 'en-US',
  force_region_ip: '',
  codec: '',
  vibration: true,
  native_vibration: false,
  dead_zone: 0.2,
  gamepad_maping: null,
  debug: false,
};

export const saveSettings = (settings: Settings) => {
  log.info('SaveSettings:', settings);
  const totalSettings = Object.assign({}, defaultSettings, settings);
  // AsyncStorage.setItem(STORE_KEY, JSON.stringify(totalSettings));
  storage.set(STORE_KEY, JSON.stringify(totalSettings));
};

export const getSettings = (): Settings => {
  let settings = storage.getString(STORE_KEY);
  if (!settings) {
    return defaultSettings;
  }
  try {
    const _settings = JSON.parse(settings) as Settings;
    return Object.assign({}, defaultSettings, _settings);
  } catch {
    return defaultSettings;
  }
};
