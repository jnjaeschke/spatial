import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { browserName: "firefox", viewport: { width: 1400, height: 900 } },
  webServer: [
    { command: "npx vite --port 5174 --strictPort", url: "http://localhost:5174", reuseExistingServer: false },
  ],
});
