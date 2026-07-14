import { createRequestHandler } from "react-router";

type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

type Env = {
  ASSETS: AssetBinding;
};

const requestHandler = createRequestHandler(
  () => import("./build/server/index.js"),
  "production",
);

function isAssetRequest(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isAssetRequest(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    return requestHandler(request, {
      cloudflare: {
        env,
      },
    });
  },
};
