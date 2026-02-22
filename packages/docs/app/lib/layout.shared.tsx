import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from './i18n';

export function baseOptions(locale: string): BaseLayoutProps {
  // 默认语言（zh）不显示前缀，其他语言显示前缀
  const isDefaultLocale = locale === i18n.defaultLanguage;
  const localePrefix = isDefaultLocale ? '' : `/${locale}`;
  
  return {
    i18n,
    nav: {
      title: 'DropOut',
      url: localePrefix || '/',
    },
    githubUrl: 'https://github.com/HydroRoll-Team/DropOut',
    links: [
      {
        type: 'main',
        text: locale === 'zh' ? '使用文档' : 'Manual',
        url: `${localePrefix}/docs/manual`,
      },
      {
        type: 'main',
        text: locale === 'zh' ? '开发文档' : 'Development',
        url: `${localePrefix}/docs/development`,
      },
    ],
  };
}
