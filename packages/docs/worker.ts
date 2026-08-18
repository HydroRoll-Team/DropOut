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

async function fetchStaticAsset(
  request: Request,
  env: Env,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const response = await env.ASSETS.fetch(request);
  return response.status === 404 ? null : response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const assetResponse = await fetchStaticAsset(request, env);
    if (assetResponse) {
      return assetResponse;
    }

    return requestHandler(request);
  },
};
