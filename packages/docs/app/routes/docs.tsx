import type { Route } from './+types/docs';
import { redirect } from 'react-router';

import { i18n } from '@/lib/i18n';

export function loader({ params }: Route.LoaderArgs) {
  const lang = params.lang as string | undefined;
  
  // 如果没有语言参数或是默认语言，重定向到 /docs/getting-started
  if (!lang || lang === i18n.defaultLanguage) {
    return redirect('/docs/getting-started');
  }
  
  // 其他语言重定向到 /:lang/docs/getting-started
  return redirect(`/${lang}/docs/getting-started`);
}
