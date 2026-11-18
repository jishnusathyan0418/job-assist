import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8001",
    browserName: "chromium",
    channel: process.env.E2E_BROWSER_CHANNEL || "chrome",
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
  },
});
