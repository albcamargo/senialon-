import { defineConfig } from "@playwright/test";

// FE 1.7 only. Does not run or retry any earlier E2E suite.
const environment = {
  DEMO_USERNAME: "synthetic-publications-operator",
  DEMO_PASSWORD: "synthetic-publications-password",
  DEMO_ALLOWED_ORIGIN: "http://127.0.0.1:3360",
  VERCEL: "",
  VERCEL_ENV: "development",
};
export default defineConfig({
  testDir: "./tests/publications-e2e",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3360",
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
      command: "node tests/fixtures/runs-server.mjs",
      url: "http://127.0.0.1:3361/health",
      env: {
        ...environment,
        SENIALON_SYNTHETIC_TEST_ONLY: "1",
        SENIALON_SYNTHETIC_PORT: "3361",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3360",
      url: "http://127.0.0.1:3360",
      env: { ...environment, SENIALON_BACKEND_URL: "http://127.0.0.1:3361/" },
      reuseExistingServer: false,
    },
  ],
});
