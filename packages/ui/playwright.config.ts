import { defineConfig } from "@playwright/test";

const port = 1420;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    colorScheme: "dark",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "default-window",
      use: { viewport: { width: 1024, height: 768 } },
    },
    {
      name: "minimum-window",
      use: { viewport: { width: 905, height: 575 } },
    },
  ],
  webServer: {
    command: "pnpm dev --host 127.0.0.1",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
