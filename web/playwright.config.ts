import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "node e2e/start-backend.mjs",
      url: "http://127.0.0.1:18080/api/metadata",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      env: { CODETABLE_API_PROXY: "http://127.0.0.1:18080" },
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
