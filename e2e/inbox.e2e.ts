// End to end: import a spreadsheet from Settings, review it in the Inbox (a duplicate is linked, the rest added
// in one go, one dismissed), see Home's notice, and undo the import. Skips the first run through the API and
// resets at the end, so the next file starts from a fresh workspace. The server's clock is real, so dates are
// relative to today.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.parse(today) - n * 864e5).toISOString().slice(0, 10);
// A bank sheet as Excel in Indonesia saves it: semicolons, day-first dates, 25.000,00.
const dmy = (day: string) => day.split('-').reverse().join('/');
const csv = [
  'Tanggal;Keterangan;Debit;Kredit',
  `${dmy(daysAgo(3))};QRIS KOPI SENJA;25.000,00;0`,
  `${dmy(daysAgo(2))};NASI PADANG;32.000,00;0`,
  `${dmy(daysAgo(2))};GAJI;0;9.500.000,00`,
  `${dmy(daysAgo(1))};BIAYA ADM;10.000,00;0`,
  'besok;RUSAK;1;0',
].join('\n');
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const sheet = (name: string) => page.getByRole('dialog', { name });
const balance = async () => {
  const b = (await (await page.request.get('/api/balances')).json()) as {
    accounts: { name: string; balance: number }[];
  };
  return b.accounts.find(a => a.name === 'Main Account')!.balance;
};

test('import a bank sheet: columns are guessed, a bad row is skipped, rows land in the Inbox', async () => {
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
  const main = cat.accounts.find(a => a.name === 'Main Account')!;
  const post = (path: string, data: unknown) => page.request.post(`/api${path}`, { data });
  await post(`/accounts/${main.id}/balance`, { actual: 1_000_000 });
  // The coffee is already logged: the import should offer to link it, not add it twice.
  await post('/transactions', {
    type: 'EXPENSE',
    accountId: main.id,
    categoryId: cat.categories.find(c => c.name === 'Food & Drink')!.id,
    amount: 25_000,
    date: daysAgo(3),
    merchant: 'kopi senja',
  });

  await page.goto('/');
  await tab('Settings').tap();
  await page.getByRole('button', { name: /Import a spreadsheet/ }).tap();
  const form = sheet('Import a spreadsheet');
  await form
    .getByLabel('CSV file')
    .setInputFiles({ name: 'mutasi.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await expect(form.getByText('5 rows in the file.')).toBeVisible();
  await expect(form.getByLabel('Date', { exact: true })).toHaveValue('0');
  await expect(form.getByLabel('Amount (or money out)')).toHaveValue('2');
  await expect(form.getByLabel('Money in, if its own column')).toHaveValue('3');
  await expect(form.getByLabel('Where / what')).toHaveValue('1');
  // The first rows show once the account (and so the currency) is known.
  await form.getByLabel('Into account').selectOption({ label: 'Main Account' });
  await expect(form.getByText('1 row skipped. Line 6: no date in "besok".')).toBeVisible();
  await expect(form.getByText('+Rp9.500.000')).toBeVisible();
  await form.getByRole('button', { name: 'Send 4 rows to the Inbox' }).tap();

  const inbox = sheet('Inbox');
  await expect(inbox.getByText('4 waiting for your OK.')).toBeVisible();
  await expect(inbox.getByRole('list', { name: 'Waiting for review' })).toContainText(
    'Looks like Kopi Senja',
  );
  expect(await balance()).toBe(975_000);
});

test('review: link the duplicate, dismiss one, add the rest at once', async () => {
  const inbox = sheet('Inbox');
  await inbox.getByRole('button', { name: 'QRIS KOPI SENJA is the entry already logged' }).tap();
  await expect(inbox.getByText('3 waiting for your OK.')).toBeVisible();
  await inbox.getByRole('button', { name: 'Dismiss BIAYA ADM' }).tap();
  await inbox.getByLabel('Category for NASI PADANG').selectOption({ label: 'Food & Drink' });
  await inbox.getByRole('button', { name: 'Add all 2 without a match' }).tap();

  await expect(inbox.getByText('Nothing is waiting.')).toBeVisible();
  await expect(inbox.getByText('4 rows · 2 added · 0 waiting')).toBeVisible();
  expect(await balance()).toBe(975_000 - 32_000 + 9_500_000);
});

test('the same file again adds nothing; Home shows no notice', async () => {
  await page.goto('/');
  await tab('Settings').tap();
  await page.getByRole('button', { name: /Import a spreadsheet/ }).tap();
  const form = sheet('Import a spreadsheet');
  await form
    .getByLabel('CSV file')
    .setInputFiles({ name: 'mutasi.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await form.getByLabel('Into account').selectOption({ label: 'Main Account' });
  await form.getByRole('button', { name: 'Send 4 rows to the Inbox' }).tap();
  await expect(page.getByText('0 to review · 4 were imported before')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Your money' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Inbox' })).toHaveCount(0);
});

test('undo the import: its entries go, the linked coffee stays', async () => {
  await tab('Settings').tap();
  await page.getByRole('button', { name: /^Inbox/ }).tap();
  const inbox = sheet('Inbox');
  await inbox.getByRole('button', { name: 'Undo this import' }).tap();
  await page.getByRole('button', { name: 'Undo import' }).tap();
  await expect(inbox.getByText('Imports')).toHaveCount(0);
  expect(await balance()).toBe(975_000);
});

test('Home shows a notice while payments wait', async () => {
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: { id: string; name: string }[];
  };
  const main = cat.accounts.find(a => a.name === 'Main Account')!;
  await page.request.post('/api/inbox/import', {
    data: { rows: [{ date: today, amount: -18_000, merchant: 'Parkir', accountId: main.id }] },
  });
  await page.goto('/');
  const notice = page.getByRole('region', { name: 'Inbox' });
  await expect(notice).toContainText('1 payment to review');
  await notice.getByRole('button').tap();
  await sheet('Inbox').getByRole('button', { name: 'Add Parkir' }).tap();
  await expect(sheet('Inbox').getByText('Nothing is waiting.')).toBeVisible();
  expect(await balance()).toBe(975_000 - 18_000);
});
