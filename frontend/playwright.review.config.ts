import { defineConfig } from "@playwright/test";

// FE 1.9 only. Does not execute or retry any earlier E2E suite.
const environment = {
  DEMO_USERNAME: "synthetic-review-operator",
  DEMO_PASSWORD: "synthetic-review-password",
  DEMO_ALLOWED_ORIGIN: "http://127.0.0.1:3380",
  VERCEL: "",
  VERCEL_ENV: "development",
};
export default defineConfig({
  testDir: "./tests/review-e2e",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3380",
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
      command: "node tests/fixtures/review-server.mjs",
      url: "http://127.0.0.1:3381/health",
      env: {
        ...environment,
        SENIALON_SYNTHETIC_TEST_ONLY: "1",
        SENIALON_SYNTHETIC_PORT: "3381",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3380",
      url: "http://127.0.0.1:3380",
      env: { ...environment, SENIALON_BACKEND_URL: "http://127.0.0.1:3381/" },
      reuseExistingServer: false,
    },
  ],
});
