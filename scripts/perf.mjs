// `npm run perf`: builds the app, checks what the first paint downloads against a size budget, then loads Home in
// Chromium (iPhone 13 screen, phone CPU 4x slower) on a throwaway database and checks the load-time targets in
// planning/features/roadmap/roadmap-v2.agent.md ("Performance goals"). The local preview server does not compress, so
// network time is worked out from the gzip sizes (as Cloudflare serves them) plus the measured round trips.
import { chromium, devices } from '@playwright/test';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const app = join(root, 'apps/centient');
const dist = join(app, 'dist/client');
const state = join(root, '.e2e-state/perf');
const port = 8792;
const base = `http://localhost:${port}`;

// Budgets: what the first paint may download (gzip), and the targets (ms).
const BUDGET = { js: 200, css: 35 }; // KB
const NETS = {
  'slow 4G': { rtt: 150, kbps: 1600, target: 2500 },
  '4G': { rtt: 50, kbps: 10000, target: 1000 },
};
const REPEAT_TARGET = 1000;

const run = cmd => execSync(cmd, { cwd: app, stdio: ['ignore', 'ignore', 'inherit'] });
console.log('Building…');
run('npx vite build');

// 1. What the first paint needs: the entry script, the chunks it preloads, the stylesheet.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map(m => m[1]);
const gz = f => gzipSync(readFileSync(join(dist, f))).length / 1024;
const js = files.filter(f => f.endsWith('.js')).reduce((s, f) => s + gz(f), 0);
const css = files.filter(f => f.endsWith('.css')).reduce((s, f) => s + gz(f), 0);
const failures = [];
const check = (ok, line) => {
  console.log(`${ok ? '✓' : '✗'} ${line}`);
  if (!ok) failures.push(line);
};
check(js <= BUDGET.js, `first-paint JS ${js.toFixed(0)} KB gzip (budget ${BUDGET.js})`);
check(css <= BUDGET.css, `first-paint CSS ${css.toFixed(0)} KB gzip (budget ${BUDGET.css})`);

// 2. Load Home on a fresh database.
rmSync(state, { recursive: true, force: true });
run(`npx wrangler d1 migrations apply DB --local --persist-to "${state}"`);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: app,
  env: { ...process.env, CENTIENT_STATE: state },
  stdio: 'ignore',
});
try {
  for (let i = 0; ; i++) {
    if (
      await fetch(`${base}/api/me`).then(
        r => r.ok,
        () => false,
      )
    )
      break;
    if (i > 60) throw new Error('preview did not start');
    await new Promise(r => setTimeout(r, 500));
  }
  await fetch(`${base}/api/workspace`, {
    method: 'PATCH',
    body: '{"onboarded":true}',
    headers: { 'content-type': 'application/json' },
  });

  const browser = await chromium.launch();
  for (const [name, net] of Object.entries(NETS)) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: net.rtt,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const home = async () => {
      const t0 = Date.now();
      await page.goto(base + '/');
      await page.getByRole('region', { name: 'Your money' }).waitFor({ timeout: 30000 });
      return Date.now() - t0;
    };
    const first = await home();
    const transfer = (((js + css) * 8) / net.kbps) * 1000; // the gzip bytes at this bandwidth
    const total = first + transfer;
    check(
      total <= net.target,
      `${name} first visit: Home in ~${total.toFixed(0)} ms (${first} measured + ${transfer.toFixed(0)} transfer; target ${net.target})`,
    );
    if (name === 'slow 4G') {
      const again = await home(); // code cached; data restored from the device
      check(
        again <= REPEAT_TARGET,
        `${name} repeat visit: Home in ${again} ms (target ${REPEAT_TARGET})`,
      );
      const me = await page.evaluate(
        () =>
          performance.getEntriesByType('resource').filter(e => e.name.endsWith('/api/me')).length,
      );
      check(me <= 1, `/api/me fetched ${me}× on load (the preload is reused)`);
    }
    await ctx.close();
  }

  // 3. No signal: once the service worker has saved the shell, Home still opens.
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(base + '/');
  // Wait for both halves of an offline start: the shell (service worker) and the data (saved query cache).
  await page.evaluate(async () => {
    for (let i = 0; i < 300; i++) {
      if ((await caches.match('/')) && localStorage.getItem('centient:queries')) return;
      await new Promise(r => setTimeout(r, 100));
    }
  });
  await ctx.setOffline(true);
  const opened = await page
    .reload()
    .then(() => page.getByRole('region', { name: 'Your money' }).waitFor({ timeout: 10000 }))
    .then(
      () => true,
      () => false,
    );
  check(opened, 'offline: Home opens from the saved shell');
  await ctx.close();
  await browser.close();
} finally {
  server.kill();
}
if (failures.length) {
  console.log(`\n${failures.length} over budget.`);
  process.exit(1);
}
