import { defineConfig } from "@playwright/test";

// FE 1.8 only. Does not execute or retry earlier E2E suites.
const environment = {
  DEMO_USERNAME: "synthetic-analysis-operator",
  DEMO_PASSWORD: "synthetic-analysis-password",
  DEMO_ALLOWED_ORIGIN: "http://127.0.0.1:3370",
  VERCEL: "",
  VERCEL_ENV: "development",
};
export default defineConfig({
  testDir: "./tests/analysis-e2e",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3370",
    browserName: "chromium",
    httpCredentials: {
      username: environment.DEMO_USERNAME,
      password: environment.DEMO_PASSWORD,
    },
    trace: "off",
    screenshot: "off",
  },
  webServer: [
    {
      command: "node tests/fixtures/analysis-server.mjs",
      url: "http://127.0.0.1:3371/health",
      env: {
        ...environment,
        SENIALON_SYNTHETIC_TEST_ONLY: "1",
        SENIALON_SYNTHETIC_PORT: "3371",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3370",
      url: "http://127.0.0.1:3370",
      env: { ...environment, SENIALON_BACKEND_URL: "http://127.0.0.1:3371/" },
      reuseExistingServer: false,
    },
  ],
});
