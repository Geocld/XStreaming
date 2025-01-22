import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import en from './languages/en';
import zh from './languages/zh';
import zht from './languages/zht';
import {getSettings} from './store/settingStore';

const settings = getSettings();

const resources = {
  en,
  zh,
  zht,
};

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: settings.locale || 'en',

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;
