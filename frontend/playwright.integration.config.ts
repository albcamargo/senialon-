import { defineConfig } from "@playwright/test";
import { dirname } from "node:path";

// FE 1.10 only: Next + FastAPI real + PostgreSQL desechable.
// No ejecuta suites anteriores ni acepta destinos o credenciales reales.
const environment = {
  DEMO_USERNAME: "synthetic-integration-operator",
  DEMO_PASSWORD: "synthetic-integration-password",
  DEMO_ALLOWED_ORIGIN: "http://127.0.0.1:3390",
  VERCEL: "",
  VERCEL_ENV: "development",
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
};

export default defineConfig({
  testDir: "./tests/integration-e2e",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: environment.DEMO_ALLOWED_ORIGIN,
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
      command:
        "../backend/.venv/bin/python -B tests/fixtures/integration-runtime.py",
      url: "http://127.0.0.1:3392/health",
      env: { SENIALON_INTEGRATION_TEST_ONLY: "1" },
      timeout: 40_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3390",
      url: environment.DEMO_ALLOWED_ORIGIN,
      env: { ...environment, SENIALON_BACKEND_URL: "http://127.0.0.1:3391/" },
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  ],
});
