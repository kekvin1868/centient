// End to end: the app lock with a real passkey ceremony (Chromium's virtual authenticator stands in for Face ID).
// Turn it on, lock, see that the server refuses a locked browser, unlock, start locked after a reload, lock by
// itself after time away, and delete everything (which takes the lock with it and leaves a fresh first run for
// the next file). Skips the first run through the API.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
  // A platform authenticator that always verifies its user, like a phone whose owner looked at it.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
});
test.afterAll(async () => {
  // If a test stopped early the lock may still be on; this browser's session can turn it off.
  await page.request.delete('/api/lock');
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const tab = (name: string) => page.getByRole('button', { name, exact: true });
const lockScreen = () => page.getByText('Centient is locked.');
const home = () => page.getByRole('region', { name: 'Your money' });
const me = () => page.request.get('/api/me');

test('turn the lock on from Settings', async () => {
  await page.goto('/');
  await tab('Settings').tap();
  await page.getByRole('button', { name: 'Turn on app lock' }).tap();
  await expect(page.getByText('App lock is on')).toBeVisible();
  await expect(page.getByLabel('Lock when away for')).toHaveValue('1');
  expect(await (await page.request.get('/api/lock')).json()).toEqual({
    enabled: true,
    unlocked: true,
  });
});

test('Lock now: the lock screen covers the app and the server refuses this browser', async () => {
  await page.getByRole('button', { name: 'Lock now' }).tap();
  await expect(lockScreen()).toBeVisible();
  await expect(tab('Settings')).toHaveCount(0);
  const refused = await me();
  expect(refused.status()).toBe(423);
  expect(await refused.json()).toMatchObject({ code: 'LOCKED' });
  expect((await page.request.get('/api/balances')).status()).toBe(423);
});

test('Unlock with the passkey brings the app back where it was', async () => {
  await page.getByRole('button', { name: 'Unlock' }).tap();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect((await me()).status()).toBe(200);
});

test('a fresh start begins locked, and a lost passkey cannot be reset without a new sign-in', async () => {
  await page.reload();
  await expect(lockScreen()).toBeVisible();
  await expect(home()).toHaveCount(0);
  // Starting locked also ended the session that was still live.
  await expect.poll(async () => (await me()).status()).toBe(423);

  await page.getByText("Can't unlock?").tap();
  await page.getByRole('button', { name: 'Reset the lock' }).tap();
  await expect(page.getByText(/Sign out of Centient and in again/)).toBeVisible();
  await expect(lockScreen()).toBeVisible();

  await page.getByRole('button', { name: 'Unlock' }).tap();
  await expect(home()).toBeVisible();
});

test('it locks by itself after time away', async () => {
  await tab('Settings').tap();
  await page.getByLabel('Lock when away for').selectOption({ label: 'Any time' });
  const away = (hidden: boolean) =>
    page.evaluate(h => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await away(true);
  await away(false);
  await expect(lockScreen()).toBeVisible();
  await page.getByRole('button', { name: 'Unlock' }).tap();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('Delete everything erases the account and the lock; the app starts over', async () => {
  await page.getByRole('button', { name: /Delete everything/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Delete everything' });
  const go = sheet.getByRole('button', { name: 'Delete everything for good' });
  await expect(go).toBeDisabled();
  await sheet.getByText('Download a backup first').tap();
  await sheet.getByLabel('Confirm').fill('DELETE');
  await go.tap();

  await expect
    .poll(
      async () =>
        ((await (await me()).json()) as { workspace: { onboarded_at: unknown } }).workspace
          .onboarded_at,
    )
    .toBeNull();
  expect(await (await page.request.get('/api/lock')).json()).toEqual({
    enabled: false,
    unlocked: true,
  });
  await expect(lockScreen()).toHaveCount(0);
});
