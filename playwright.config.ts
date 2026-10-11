import { defineConfig } from "@playwright/test";

const port = Number(process.env.ALTURA_QA_PORT || 3100);
const baseURL = process.env.ALTURA_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.ALTURA_BASE_URL ? undefined : {
    command: `npm run start -- --hostname 127.0.0.1 -p ${port}`,
    url: `${baseURL}/api/health?probe=liveness`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
