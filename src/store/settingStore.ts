import {storage} from './mmkv';
import {debugFactory} from '../utils/debug';
const log = debugFactory('settingStore');

const STORE_KEY = 'user.settings';

type DisplayOptions = {
  sharpness: number;
  saturation: number;
  contrast: number;
  brightness: number;
};

export type Settings = {
  locale: string;
  resolution: number;
  xhome_bitrate_mode: string;
  xhome_bitrate: number | string;
  xcloud_bitrate_mode: string;
  xcloud_bitrate: number | string;
  audio_bitrate_mode: string;
  audio_bitrate: number | string;
  preferred_game_language: string;
  force_region_ip: string;
  codec: string;
  show_performance: boolean;
  performance_style: boolean;
  vibration: boolean;
  vibration_mode: string;
  bind_usb_device: boolean;
  rumble_intensity: number;
  gamepad_kernal: string;
  dead_zone: number;
  edge_compensation: number;
  short_trigger: boolean;
  video_format: string;
  show_virtual_gamead: boolean;
  virtual_gamepad_opacity: number;
  custom_virtual_gamepad: string;
  gamepad_maping: Record<string, number> | null;
  native_gamepad_maping: Record<string, number> | null;
  gyroscope: boolean;
  gyroscope_sensitivity: number;
  display_options: DisplayOptions;
  ipv6: boolean;
  check_update: boolean;
  power_on: boolean;
  theme: string;
  debug: boolean;
};

const defaultSettings: Settings = {
  locale: 'en',
  resolution: 720,
  xhome_bitrate_mode: 'auto',
  xhome_bitrate: 20,
  xcloud_bitrate_mode: 'auto',
  xcloud_bitrate: 20,
  audio_bitrate_mode: 'auto',
  audio_bitrate: 20,
  preferred_game_language: 'en-US',
  force_region_ip: '',
  codec: '',
  show_performance: false,
  performance_style: true,
  vibration: true,
  vibration_mode: 'Native',
  bind_usb_device: false,
  rumble_intensity: 3,
  gamepad_kernal: 'Native',
  dead_zone: 0.1,
  edge_compensation: 0,
  short_trigger: false,
  video_format: '',
  show_virtual_gamead: false,
  virtual_gamepad_opacity: 0.6,
  custom_virtual_gamepad: '',
  gamepad_maping: null,
  native_gamepad_maping: null,
  gyroscope: false,
  gyroscope_sensitivity: 10000,
  ipv6: false,
  check_update: true,
  power_on: false,
  display_options: {
    sharpness: 5,
    saturation: 100,
    contrast: 100,
    brightness: 100,
  },
  theme: 'dark',
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
