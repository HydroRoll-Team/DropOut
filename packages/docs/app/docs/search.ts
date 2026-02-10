import type { Route } from './+types/search';
import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

const server = createFromSource(source, {
  localeMap: {
    zh: {
      language: 'english',
    },
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}
