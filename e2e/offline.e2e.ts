// End to end: the offline queue. With the network off, an entry logged on Home shows at once as waiting and
// moves the balance; with it back, it is sent once and becomes an ordinary row. A reload in between loses
// nothing. Skips the first run through the API and resets at the end, so the next file starts fresh.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
let main: { id: string };
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.request.patch('/api/workspace', { data: { onboarded: true } });
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: { id: string; name: string }[];
  };
  main = cat.accounts.find(a => a.name === 'Main Account')!;
  const set = await page.request.post(`/api/accounts/${main.id}/balance`, {
    data: { actual: 500_000 },
  });
  expect(set.ok()).toBe(true);
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const box = () => page.getByLabel('What did you spend or receive?');
const row = (name: string) => page.locator('.entry-row', { hasText: name });
const hero = () => page.getByRole('region', { name: 'Your money' });
/** Entries the owner logged, as the server has them. */
const logged = async () =>
  (
    (await (await page.request.get('/api/entries')).json()) as {
      items: { id: string; kind: string; command: { merchant?: string; amount: number } }[];
    }
  ).items.filter(e => e.kind === 'USER');
const log = async (line: string) => {
  await box().fill(line);
  await box().press('Enter');
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
};

test('with signal an entry goes straight through and is never marked', async () => {
  await page.goto('/');
  await expect(hero()).toContainText('500.000');
  await log('bakso 20rb');
  await expect(row('Bakso')).toBeVisible();
  await expect(row('Bakso')).not.toHaveAttribute('data-waiting', /.*/);
  await expect(hero()).toContainText('480.000');
  expect((await logged()).map(e => e.command.merchant?.toLowerCase())).toEqual(['bakso']);
});

test('offline: logging works, the rows wait and the balance moves', async () => {
  await page.context().setOffline(true);
  await log('kopi 25rb');
  await log('parkir 5rb');
  for (const name of ['Kopi', 'Parkir']) {
    await expect(row(name)).toHaveAttribute('data-waiting', 'waiting');
    await expect(row(name)).toContainText('waiting');
  }
  await expect(hero()).toContainText('450.000');
});

test('offline: a waiting entry can be edited and another deleted before anything is sent', async () => {
  await row('Parkir')
    .getByRole('button', { name: /^Parkir/ })
    .tap();
  const sheet = page.getByRole('dialog', { name: 'Edit' });
  await sheet.getByRole('textbox', { name: 'Amount' }).fill('7000');
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(hero()).toContainText('448.000');
  await expect(row('Parkir')).toHaveAttribute('data-waiting', 'waiting');
});

test('closing and reopening the app offline keeps what waits', async () => {
  const kept = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('centient:outbox') ?? '[]'),
  );
  expect(kept.map((i: { op: string }) => i.op)).toEqual(['create', 'create']);
  // Nothing reached the server.
  await page.context().setOffline(false);
  expect(await logged()).toHaveLength(1);
});

test('back online: each one is saved once, with the id the phone gave it', async () => {
  const ids = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('centient:outbox') ?? '[]').map(
      (i: { entryId: string }) => i.entryId,
    ),
  );
  // The browser's `online` event starts the send.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await logged()).length).toBe(3);
  for (const name of ['Kopi', 'Parkir'])
    await expect(row(name)).not.toHaveAttribute('data-waiting', /.*/);
  await expect(hero()).toContainText('448.000');
  const saved = await logged();
  expect(saved.map(e => e.id)).toEqual(expect.arrayContaining(ids));
  expect(saved.find(e => e.command.merchant?.toLowerCase() === 'parkir')?.command.amount).toBe(
    7_000,
  );
  expect(await page.evaluate(() => localStorage.getItem('centient:outbox'))).toBe('[]');

  await page.reload();
  await expect(row('Kopi')).toBeVisible();
  expect(await logged()).toHaveLength(3);
});

test('offline: deleting a saved entry hides it and gives the money back; online it is gone', async () => {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const kopi = row('Kopi');
  // Focusing a row's action slides the row open (the keyboard's way in; the swipe is covered in smoothing.e2e).
  const del = kopi.getByRole('button', { name: 'Delete Kopi' });
  await del.focus();
  await expect(del).toHaveCSS('opacity', '1');
  await del.click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  // The undo window ends when the screen changes or the toast runs out.
  await expect(row('Kopi')).toHaveCount(0);
  await expect(hero()).toContainText('473.000', { timeout: 10_000 });
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await logged()).length).toBe(2);
  await expect(hero()).toContainText('473.000');
});
