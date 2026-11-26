import { defineConfig } from "@playwright/test";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", ...(ci ? {} : { channel: "chrome" }) },
  webServer: [
    {
      command: "node server/src/main.ts",
      url: "http://localhost:8080/api/health",
      env: { DATABASE_URL: "pglite:memory", PUBLIC_URL: "http://localhost:5173", COOKIE_SECURE: "false", PORT: "8080" },
      reuseExistingServer: false,
    },
    { command: "npm run dev -w web -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: false },
  ],
});
