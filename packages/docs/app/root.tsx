import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useParams,
} from 'react-router';
import { RootProvider } from 'fumadocs-ui/provider/react-router';
import type { Route } from './+types/root';
import './app.css';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { i18n } from './lib/i18n';

const { provider } = defineI18nUI(i18n, {
  translations: {
    en: {
      displayName: 'English',
    },
    zh: {
      displayName: '中文',
      search: '查找文档',
    },
  },
});
export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { lang = i18n.defaultLanguage } = useParams();
  
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={provider(lang)}>{children}</RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex-1 flex flex-col items-center p-4 mt-40 text-center">
      <h1 className="text-9xl font-black mb-4 bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent opacity-50">
        {message}
      </h1>
      <p className="text-2xl font-semibold mb-2">{details}</p>
      <p className="text-fd-muted-foreground mb-8 max-w-md">
        Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
      </p>
      <Link
        to="/"
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full px-8 py-3 shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95"
      >
        Return Home / 返回首页
      </Link>
      {stack && (
        <div className="mt-12 w-full max-w-2xl text-left">
          <p className="text-xs font-mono text-fd-muted-foreground mb-2 uppercase tracking-widest">Error Stack</p>
          <pre className="p-4 overflow-x-auto text-sm bg-fd-muted rounded-xl border border-fd-border font-mono whitespace-pre-wrap break-all shadow-inner">
            <code>{stack}</code>
          </pre>
        </div>
      )}
    </main>
  );
}
