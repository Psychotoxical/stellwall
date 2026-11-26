import { defineConfig } from "@playwright/test";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // All tests share one server and its database, so they run one after another.
  workers: 1,
  use: { baseURL: "http://localhost:5173", ...(ci ? {} : { channel: "chrome" }) },
  webServer: [
    {
      command: "node server/src/main.ts",
      url: "http://localhost:8080/api/health",
      env: { DATABASE_URL: "pglite:memory", PUBLIC_URL: "http://localhost:5173", COOKIE_SECURE: "false", PORT: "8080" },
      reuseExistingServer: false,
    },
    { command: "npm run dev -w web -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: false },
    // A stand-in for Mealie, so the meal plan can be tested without a real recipe server.
    { command: "node e2e/mealie-stub.ts", url: "http://127.0.0.1:8090/api/recipes", reuseExistingServer: false },
  ],
});
