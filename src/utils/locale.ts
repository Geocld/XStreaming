import {NativeModules, Platform} from 'react-native';

export const SUPPORTED_LOCALES = ['en', 'zh', 'zht', 'de', 'es', 'pt'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const normalizeAppLocale = (locale?: string | null): SupportedLocale => {
  const raw = String(locale || '')
    .replace('_', '-')
    .toLowerCase();

  if (raw.startsWith('zh')) {
    if (
      raw.includes('hant') ||
      raw.includes('tw') ||
      raw.includes('hk') ||
      raw.includes('mo')
    ) {
      return 'zht';
    }
    return 'zh';
  }

  if (raw.startsWith('de')) {
    return 'de';
  }
  if (raw.startsWith('es')) {
    return 'es';
  }
  if (raw.startsWith('pt')) {
    return 'pt';
  }

  return 'en';
};

export const getSystemLocale = (): SupportedLocale => {
  const settings = NativeModules.SettingsManager?.settings;
  const iosLocale =
    settings?.AppleLocale ||
    (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : '');
  const androidLocale =
    NativeModules.I18nManager?.localeIdentifier ||
    NativeModules.PlatformConstants?.locale ||
    NativeModules.PlatformConstants?.reactNativeVersion?.locale;

  return normalizeAppLocale(Platform.OS === 'ios' ? iosLocale : androidLocale);
};
