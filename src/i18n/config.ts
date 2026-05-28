import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhTranslations from './zh.json';
import enTranslations from './en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: {
        translation: zhTranslations
      },
      en: {
        translation: enTranslations
      }
    },
    lng: 'zh', // 默认语言
    fallbackLng: 'zh', // 如果当前语言没有对应的翻译，则回退到中文
    interpolation: {
      escapeValue: false // React 已经处理了 XSS，不需要额外的 escape
    }
  });

export default i18n;
