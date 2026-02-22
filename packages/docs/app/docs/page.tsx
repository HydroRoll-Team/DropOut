import type { Route } from './+types/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsPage, DocsBody, DocsDescription, DocsTitle } from 'fumadocs-ui/page';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { source } from '@/lib/source';
import { i18n } from '@/lib/i18n';
import { baseOptions } from '@/lib/layout.shared';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import browserCollections from 'fumadocs-mdx:collections/browser';

export async function loader({ params }: Route.LoaderArgs) {
  // 从路由参数获取语言，如果没有则使用默认语言
  // URL 格式: /docs/manual/getting-started (默认语言 zh)
  // URL 格式: /en/docs/manual/getting-started (英语)
  const lang = (params.lang && i18n.languages.includes(params.lang as any))
    ? (params.lang as 'zh' | 'en')
    : (i18n.defaultLanguage as 'zh' | 'en');
  
  // 获取文档路径 slugs
  const slugs = params['*']?.split('/').filter((v) => v.length > 0) || [];
  
  const page = source.getPage(slugs, lang);
  
  if (!page) {
    throw new Response('Not found', { status: 404 });
  }

  return {
    path: page.path,
    pageTree: await source.serializePageTree(source.getPageTree(lang)),
    lang,
  };
}

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: Mdx }) {
    return (
      <DocsPage toc={toc}>
        {/* 老王说不要这个 */}
        {/* <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription> */}
        <DocsBody>
          <Mdx 
            components={{ 
              ...defaultMdxComponents, 
              Card: (props: any) => (
                <Card 
                  {...props} 
                  className={`border-blue-600/20 hover:border-blue-600/50 transition-colors ${props.className || ''}`} 
                />
              ), 
              Cards 
            }} 
          />
        </DocsBody>
      </DocsPage>
    );
  },
});

export default function Page({ loaderData, params }: Route.ComponentProps) {
  const { pageTree, lang } = useFumadocsLoader(loaderData);

  return (
    <DocsLayout {...baseOptions(lang)} tree={pageTree}>
      {clientLoader.useContent(loaderData.path)}
    </DocsLayout>
  );
}
