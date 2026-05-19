import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import en from './languages/en';
import zh from './languages/zh';
import zht from './languages/zht';
import de from './languages/de';
import es from './languages/es';
import pt from './languages/pt';
import ko from './languages/ko';
import ja from './languages/ja';
import hi from './languages/hi';
import {getSettings} from './store/settingStore';
import {normalizeAppLocale} from './utils/locale';

const settings = getSettings();

const resources = {
  en,
  zh,
  zht,
  de,
  es,
  pt,
  ko,
  ja,
  hi,
};

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: normalizeAppLocale(settings.locale),
    fallbackLng: 'en',

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;
