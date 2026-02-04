import { route, type RouteConfig } from '@react-router/dev/routes';

export default [
  // Home routes: / and /:lang
  route(':lang?', 'routes/home.tsx', { id: 'home' }),

  // Docs routes: /docs/* and /:lang/docs/*
  route(':lang?/docs', 'routes/docs.tsx', { id: 'docs' }),
  route(':lang?/docs/*', 'docs/page.tsx', { id: 'docs-page' }),

  // API routes
  route('api/search', 'docs/search.ts', { id: 'api-search' }),

  // Catch-all 404
  route('*', 'routes/not-found.tsx', { id: 'not-found' }),
] satisfies RouteConfig;
