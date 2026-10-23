// End-to-end tests: the real app (Worker + D1 + R2 in workerd via Vite) on its own port and its own throwaway
// state in .e2e-state/, driven by Chromium at iPhone size. `npm run e2e`. Your dev data (port 8787) is never touched.
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const state = resolve(import.meta.dirname, '.e2e-state');
const port = 8790;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1, // one shared workspace (dev sign-in), so tests run in order
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, ...devices['iPhone 13'], browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    // Fresh database every run: wipe, migrate, then serve.
    command: `rm -rf "${state}" && cd apps/centient && npx wrangler d1 migrations apply DB --local --persist-to "${state}" && PORT=${port} CENTIENT_STATE="${state}" npx vite dev`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
