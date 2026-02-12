import i18next from '../../i18n';

const {t} = i18next;

const bases = [
  {
    name: 'locale',
    type: 'radio',
    title: t('App language'),
    description: t('Set language of XStreaming'),
    data: [
      {value: 'en', text: 'English'},
      {value: 'zh', text: '简体中文'},
      {value: 'zht', text: '繁體中文'},
    ],
  },
  {
    name: 'theme',
    type: 'radio',
    title: t('Theme'),
    description: t('Set the app theme to take effect on the next launch'),
    data: [
      {value: 'auto', text: t('Auto')},
      {value: 'light', text: t('Light')},
      {value: 'dark', text: t('Dark')},
    ],
  },
  {
    name: 'render_engine',
    type: 'radio',
    title: t('renderEngineTitle'),
    description: t('renderEngineDesc'),
    tips: t('renderEngineTips'),
    data: [
      {value: 'native', text: t('Native')},
      {value: 'web', text: t('Webview')},
    ],
  },
  {
    name: 'use_msal_login',
    type: 'radio',
    title: t('useMsalLoginTitle'),
    description: t('useMsalLoginDesc'),
    data: [
      {value: false, text: t('Disable')},
      {value: true, text: t('Enable')},
    ],
  },
  {
    name: 'preferred_game_language',
    type: 'radio',
    title: t('Preferred language of game'),
    description: t('Set language of cloud game'),
    data: [
      {value: '', text: 'Default'},
      {value: 'ar-SA', text: 'Arabic (Saudi Arabia)'},
      {value: 'cs-CZ', text: 'Czech'},
      {value: 'da-DK', text: 'Danish'},
      {value: 'de-DE', text: 'German'},
      {value: 'el-GR', text: 'Greek'},
      {value: 'en-GB', text: 'English (United Kingdom)'},
      {value: 'en-US', text: 'English (United States)'},
      {value: 'es-ES', text: 'Spanish (Spain)'},
      {value: 'es-MX', text: 'Spanish (Mexico)'},
      {value: 'fi-FI', text: 'Swedish'},
      {value: 'fr-FR', text: 'French'},
      {value: 'he-IL', text: 'Hebrew'},
      {value: 'hu-HU', text: 'Hungarian'},
      {value: 'it-IT', text: 'Italian'},
      {value: 'ja-JP', text: '日本語'},
      {value: 'ko-KR', text: 'Korean'},
      {value: 'nb-NO', text: 'Norwegian'},
      {value: 'nl-NL', text: 'Dutch'},
      {value: 'pl-PL', text: 'Polish'},
      {value: 'pt-BR', text: 'Portuguese (Brazil)'},
      {value: 'pt-PT', text: 'Portuguese (Portugal)'},
      {value: 'ru-RU', text: 'Russian'},
      {value: 'sk-SK', text: 'Slovak'},
      {value: 'sv-SE', text: 'Swedish'},
      {value: 'tr-TR', text: 'Turkish'},
      {value: 'zh-CN', text: '简体中文'},
      {value: 'zh-TW', text: '繁體中文'},
    ],
  },
];

export default bases;
