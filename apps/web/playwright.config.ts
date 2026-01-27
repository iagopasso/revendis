import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3003'
  },
  webServer: {
    command: 'npm --workspace web run dev -- --port 3003',
    url: 'http://localhost:3003',
    reuseExistingServer: true
  }
});
