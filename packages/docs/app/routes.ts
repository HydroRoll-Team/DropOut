import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('docs', 'routes/docs.tsx'),
  route('docs/*', 'docs/page.tsx'),
  route('api/search', 'docs/search.ts'),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
