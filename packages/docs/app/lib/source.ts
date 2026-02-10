import { loader } from 'fumadocs-core/source';
import { docs } from 'fumadocs-mdx:collections/server';
import { i18n } from './i18n';

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: '/docs',
  i18n,
  // hideLocale: 'default-locale' 会自动生成正确的 URL:
  // - 默认语言 (zh): /docs/getting-started
  // - 其他语言 (en): /en/docs/getting-started
});
