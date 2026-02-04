import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
  defaultLanguage: 'zh',
  languages: ['zh', 'en'],
  hideLocale: 'default-locale',
  parser: 'dir', // 使用目录结构 (content/zh/*, content/en/*)
});
