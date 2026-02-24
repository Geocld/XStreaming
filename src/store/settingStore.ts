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
  render_engine: 'web' | 'native';
  xhome_bitrate_mode: string;
  xhome_bitrate: number | string;
  xcloud_bitrate_mode: string;
  xcloud_bitrate: number | string;
  audio_bitrate_mode: string;
  audio_bitrate: number | string;
  enable_audio_control: boolean;
  enable_audio_rumble: boolean;
  audio_rumble_threshold: number;
  preferred_game_language: string;
  force_region_ip: string;
  signaling_home_name: string;
  signaling_cloud_name: string;
  codec: string;
  show_performance: boolean;
  performance_style: boolean;
  vibration: boolean;
  vibration_mode: string;
  bind_usb_device: boolean;
  show_harmony_modal: boolean;
  rumble_intensity: number;
  gamepad_kernal: string;
  dead_zone: number;
  edge_compensation: number;
  short_trigger: boolean;
  video_format: string;
  show_virtual_gamead: boolean;
  virtual_gamepad_opacity: number;
  virtual_gamepad_joystick: number;
  custom_virtual_gamepad: string;
  gamepad_maping: Record<string, number> | null;
  native_gamepad_maping: Record<string, number> | null;
  polling_rate: number;
  sensor: number;
  sensor_type: number;
  sensor_sensitivity_x: number;
  sensor_sensitivity_y: number;
  sensor_invert: number;
  left_trigger_type: number;
  left_trigger_effects: [];
  right_trigger_type: number;
  right_trigger_effects: [];
  display_options: DisplayOptions;
  fsr_display_options: DisplayOptions;
  hold_buttons: [];
  ipv6: boolean;
  check_update: boolean;
  power_on: boolean;
  use_inner_turn_server: boolean;
  server_url: string;
  server_username: string;
  server_credential: string;
  theme: string;
  show_menu: boolean;
  fsr: boolean;
  use_msal_login: boolean;
  debug: boolean;
};

const defaultSettings: Settings = {
  locale: 'en',
  resolution: 720,
  render_engine: 'native',
  xhome_bitrate_mode: 'auto',
  xhome_bitrate: 20,
  xcloud_bitrate_mode: 'auto',
  xcloud_bitrate: 20,
  audio_bitrate_mode: 'auto',
  audio_bitrate: 20,
  enable_audio_control: false,
  enable_audio_rumble: false,
  audio_rumble_threshold: 20,
  preferred_game_language: 'en-US',
  force_region_ip: '',
  signaling_home_name: '',
  signaling_cloud_name: '',
  codec: '',
  show_performance: false,
  performance_style: true,
  vibration: true,
  vibration_mode: 'Native',
  bind_usb_device: false,
  show_harmony_modal: true,
  rumble_intensity: 3,
  gamepad_kernal: 'Native',
  dead_zone: 0.1,
  edge_compensation: 0,
  short_trigger: false,
  video_format: '',
  show_virtual_gamead: false,
  virtual_gamepad_opacity: 0.7,
  custom_virtual_gamepad: '',
  virtual_gamepad_joystick: 1,
  gamepad_maping: null,
  native_gamepad_maping: null,
  polling_rate: 62.5,
  sensor: 0,
  sensor_type: 1,
  sensor_sensitivity_x: 15000,
  sensor_sensitivity_y: 15000,
  sensor_invert: 0,
  left_trigger_type: 0,
  left_trigger_effects: [],
  right_trigger_type: 0,
  right_trigger_effects: [],
  ipv6: false,
  check_update: true,
  power_on: false,
  use_inner_turn_server: false,
  server_url: '',
  server_username: '',
  server_credential: '',
  display_options: {
    sharpness: 5,
    saturation: 100,
    contrast: 100,
    brightness: 100,
  },
  fsr_display_options: {
    sharpness: 2,
    saturation: 5,
    contrast: 5,
    brightness: 5,
  },
  hold_buttons: [],
  theme: 'dark',
  show_menu: false,
  fsr: false,
  use_msal_login: false,
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

export const resetSettings = () => {
  log.info('resetSettings');
  storage.set(STORE_KEY, JSON.stringify(defaultSettings));
};
