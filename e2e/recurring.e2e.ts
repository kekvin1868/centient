// End to end: recurring bills. Add a bill from Money's Subscriptions, see it under Coming up on Home, mark it
// paid, pay a card's statement, and turn a payment found in the entries into a bill. Skips the first run through
// the API and resets at the end, so the next file starts from a fresh workspace. The server's clock is real, so
// dates are relative to today.
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

const send = async (method: 'post' | 'patch', path: string, data: unknown) => {
  const r = await page.request[method](`/api${path}`, { data });
  expect(r.ok()).toBe(true);
  return r.json();
};
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.parse(today) - n * 864e5).toISOString().slice(0, 10);
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const sheet = (name: string | RegExp) => page.getByRole('dialog', { name });
type Named = { id: string; name: string };
let main: Named;
let fun: Named;

test('add a bill from Money: totals, the calendar mark and the row', async () => {
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: Named[];
    categories: Named[];
  };
  main = cat.accounts.find(a => a.name === 'Main Account')!;
  fun = cat.categories.find(c => c.name === 'Fun')!;
  await send('post', `/accounts/${main.id}/balance`, { actual: 5_000_000 });

  await page.goto('/');
  await tab('Money').tap();
  await page.getByRole('button', { name: /Bills that repeat/ }).tap();
  const subs = sheet('Subscriptions');
  await expect(subs.getByText('Nothing yet.')).toBeVisible();
  await subs.getByRole('button', { name: 'Add a bill' }).tap();

  const form = sheet('Add a bill');
  await expect(form.getByRole('button', { name: 'Give it a name' })).toBeDisabled();
  await form.getByLabel('Name').fill('Netflix');
  // A known service brings its category.
  await expect(form.getByLabel('Category')).toHaveValue(fun.id);
  await form.getByLabel('Amount each time').fill('120000');
  await form.getByLabel('Paid from').selectOption({ label: 'Main Account' });
  await form.getByRole('button', { name: 'Save' }).tap();

  await expect(subs.getByText('Rp120.000 a month')).toBeVisible();
  await expect(subs.getByText('Rp1.440.000 a year')).toBeVisible();
  await expect(subs.getByRole('button', { name: /^Netflix/ })).toContainText('Due today');
  const mark = subs.getByRole('button', { name: /1 bill due$/ }).first();
  await mark.tap();
  await expect(subs.getByRole('list', { name: /^Due / })).toContainText('Netflix');
});

test('Home lists it under Coming up; Mark paid logs it and moves it on', async () => {
  await page.goto('/');
  const coming = page.getByRole('region', { name: 'Bills coming up' });
  await expect(coming.getByRole('button', { name: /Netflix/ })).toContainText('Due today');
  await coming.getByRole('button', { name: /Netflix/ }).tap();
  await sheet('Subscriptions')
    .getByRole('button', { name: /^Netflix/ })
    .tap();
  await sheet('Netflix').getByRole('button', { name: 'Mark paid Rp120.000' }).tap();

  await expect(sheet('Subscriptions').getByRole('button', { name: /^Netflix/ })).toContainText(
    /Due in \d+ days/,
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Your money' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bills coming up' })).toHaveCount(0);
  const entries = (await (await page.request.get('/api/entries?limit=5')).json()) as {
    items: { command: { merchant?: string; amount?: number } | null }[];
  };
  expect(entries.items.some(e => e.command?.merchant === 'Netflix')).toBe(true);
});

test("a card's bill: what was owed at the statement, then I paid it", async () => {
  const card = await send('post', '/accounts', {
    name: 'BCA Card',
    kind: 'CREDIT_CARD',
    dueDay: 28,
  });
  // The statement closed three days ago: spending before it is billed, spending after goes on the next bill.
  await send('patch', `/accounts/${card.id}`, { statement_day: Number(daysAgo(3).slice(8)) });
  const spend = (date: string, amount: number) =>
    send('post', '/transactions', {
      type: 'EXPENSE',
      accountId: card.id,
      categoryId: fun.id,
      amount,
      date,
    });
  await spend(daysAgo(5), 700_000);
  await spend(today, 150_000);

  await page.goto('/');
  await tab('Money').tap();
  const hand = page
    .getByRole('group', { name: 'Accounts' })
    .getByRole('button', { name: /^BCA Card/ });
  await hand.focus();
  await hand.press('Enter');
  const bill = page.getByRole('region', { name: 'Card bill' });
  await expect(bill).toContainText('Rp700.000');
  await expect(bill).toContainText('Rp150.000 spent since then goes on the next bill.');
  await bill.getByRole('button', { name: 'I paid it' }).tap();

  const pay = sheet('Pay BCA Card');
  await pay.getByLabel('Paid from').selectOption({ label: 'Main Account' });
  await expect(pay.getByLabel('Amount')).toHaveValue('700.000');
  await pay.getByRole('button', { name: 'Log the payment' }).tap();
  await expect(bill).toContainText('Nothing left to pay of the Rp700.000');
});

test('a payment found in the entries becomes a bill, or is hidden', async () => {
  const pay = (merchant: string, amount: number, ago: number) =>
    send('post', '/transactions', {
      type: 'EXPENSE',
      accountId: main.id,
      categoryId: fun.id,
      amount,
      date: daysAgo(ago),
      merchant,
    });
  for (const ago of [62, 31, 1]) await pay('spotify', 54_990, ago);
  for (const ago of [61, 30]) await pay('gym', 250_000, ago);

  await page.goto('/');
  await tab('Money').tap();
  await page.getByRole('button', { name: /bill that repeat/ }).tap();
  const subs = sheet('Subscriptions');
  await expect(subs.getByText('Found in your entries')).toBeVisible();
  await subs.getByRole('button', { name: 'Hide Gym' }).tap();
  await expect(subs.getByRole('button', { name: 'Hide Gym' })).toHaveCount(0);

  await subs.getByRole('button', { name: 'Add Spotify as a bill' }).tap();
  const form = sheet('Add a bill');
  await expect(form.getByLabel('Name')).toHaveValue('Spotify');
  await expect(form.getByLabel('Amount each time')).toHaveValue('54.990');
  await form.getByRole('button', { name: 'Save' }).tap();

  await expect(subs.getByRole('button', { name: /^Spotify/ })).toBeVisible();
  await expect(subs.getByText('Found in your entries')).toHaveCount(0);
  await expect(subs.getByText('Rp174.990 a month')).toBeVisible();
});
