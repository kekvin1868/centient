// End-to-end tests: the real app (Worker + D1 + R2 in workerd via Vite) on its own port and its own throwaway
// state in .e2e-state/, at iPhone size in Chromium and in WebKit (Safari's engine, what the iPhone PWA runs).
// `npm run e2e`. Your dev data (port 8787) is never touched.
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const state = resolve(import.meta.dirname, '.e2e-state');
const port = 8790;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1, // one shared workspace (dev sign-in), so tests, files and projects run one at a time
  forbidOnly: CI,
  // CI only: a test that passes on a retry is reported as flaky, not hidden. Locally a failure is a failure.
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Reduced motion: the retro screen and dialog effects are off, so layout is measured at rest (and that path is tested).
  use: {
    baseURL: `http://localhost:${port}`,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'] },
      // Late in smoothing.e2e (a full workspace) a tap takes 2-3 s in Playwright's WebKit, about 5x Chromium, even
      // finding the button; so the long specs need more than 30 s. Worth a look on a real iPhone (`npm run phone`).
      timeout: 90_000,
      // The passkey ceremony needs Chromium's virtual authenticator (DevTools); WebKit has nothing to stand in for Face ID.
      testIgnore: /lock\.e2e\.ts/,
    },
  ],
  webServer: {
    // Fresh database every run: wipe, migrate, then serve.
    command: `rm -rf "${state}" && cd apps/centient && npx wrangler d1 migrations apply DB --local --persist-to "${state}" && PORT=${port} CENTIENT_STATE="${state}" npx vite dev`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
