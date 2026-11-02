// End to end: the Insights tab (steps 4 and 5). Four tabs, the empty state, totals and the comparison line, category bars
// with shares, the currency chips, previous / next / year, the savings rate's 404 and its nuclear alarm, and the `?`;
// then step 5: the trend and its readout, Daily Wallet Spending, merchants, biggest expenses, the entries sheet with
// counted amounts, and Budgets over time.
// Runs first (alphabetical) on a fresh workspace, skips the first run through the API, and resets at the end so
// onboarding.e2e.ts still starts from a fresh first run. The server's clock is real, so dates are relative to today.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
const errors: string[] = [];
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
  await page.goto('/');
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const api = (path: string, data?: unknown) => (data === undefined ? page.request.get(`/api${path}`) : page.request.post(`/api${path}`, { data }));
const jakartaDay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const today = jakartaDay();
const [y, m] = today.split('-').map(Number);
/** First day of the month `back` months ago, and its names. */
const monthOf = (back: number) => {
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  const name = (month: 'long' | 'short') => d.toLocaleDateString('en-US', { month, timeZone: 'UTC' });
  return { first: d.toISOString().slice(0, 10), long: name('long'), label: `${name('short')} ${d.getUTCFullYear()} cycle`, year: d.getUTCFullYear() };
};
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const totals = () => page.getByRole('region', { name: 'Totals' });

test('T4.29 four tabs: Home, Money, Insights, Settings', async () => {
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button')).toHaveText(['Home', 'Money', 'Insights', 'Settings']);
  await tab('Insights').tap();
  await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible();
});

test('T4.33 an empty workspace shows the empty state', async () => {
  await expect(page.getByRole('heading', { name: monthOf(0).label })).toBeVisible();
  await expect(totals()).toContainText('Nothing to compare with yet');
  await expect(totals()).toContainText('404 Income Error');
  await expect(page.getByText('No spending in this period yet.')).toHaveCount(4); // categories, trend, weekdays, biggest (step 5)
  await expect(page.getByRole('radiogroup', { name: 'Currency' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous period' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('T4.30, T4.37 totals, savings rate, the comparison and category bars', async () => {
  const cat = await (await api('/catalog')).json() as { accounts: { id: string; name: string }[]; categories: { id: string; name: string }[] };
  const acc = (n: string) => cat.accounts.find(a => a.name === n)!.id;
  const c = (n: string) => cat.categories.find(x => x.name === n)!.id;
  const main = acc('Main Account');
  const wise = await (await api('/accounts', { name: 'Wise', kind: 'BANK', currency: 'USD' })).json() as { id: string };
  const commands = [
    { type: 'INCOME', accountId: main, categoryId: c('Salary'), amount: 10_000_000, date: today },
    { type: 'EXPENSE', accountId: main, categoryId: c('Shopping'), amount: 800_000, date: today },
    { type: 'EXPENSE', accountId: main, categoryId: c('Food & Drink'), amount: 550_000, date: today },
    { type: 'EXPENSE', accountId: main, categoryId: c('Transport'), amount: 50_000, date: today },
    { type: 'TRANSFER', fromAccountId: main, toAccountId: acc('Dailies'), amount: 1_000_000, fee: 2_500, date: today },
    { type: 'EXPENSE', accountId: wise.id, categoryId: c('Food & Drink'), amount: 2_000, date: today },
    // Last month's first day (inside the same days so far), and the month before: income under spending.
    { type: 'EXPENSE', accountId: main, categoryId: c('Food & Drink'), amount: 1_000_000, date: monthOf(1).first },
    { type: 'EXPENSE', accountId: main, categoryId: c('Food & Drink'), amount: 500_000, date: monthOf(2).first },
    { type: 'INCOME', accountId: main, categoryId: c('Salary'), amount: 400_000, date: monthOf(2).first },
  ];
  expect((await api('/transactions', { commands })).ok()).toBe(true);
  await page.reload();
  await tab('Insights').tap();

  await expect(totals()).toContainText('Rp1.402.500');
  await expect(totals()).toContainText('Rp10.000.000');
  await expect(totals()).toContainText('86%');
  await expect(totals()).toContainText(`Rp402.500 more than ${monthOf(1).long} so far`);
  const rows = page.getByRole('figure', { name: 'Spending by category' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  const expected = [['Shopping', '57%'], ['Food & Drink', '39%'], ['Transport', '4%'], ['Fees', '<1%']];
  for (const [i, [name, share]] of expected.entries()) {
    await expect(rows.nth(i)).toContainText(name);
    await expect(rows.nth(i)).toContainText(share);
  }
  await expect(rows.nth(0).getByRole('button')).toHaveCount(1); // step 5 (R5.11): a row opens its entries
});

test('T4.31, T4.38 the currency chips switch every number; USD has no income', async () => {
  const chips = page.getByRole('radiogroup', { name: 'Currency' });
  await expect(chips.getByRole('radio')).toHaveText(['IDR', 'USD']);
  await chips.getByRole('radio', { name: 'USD' }).tap();
  await expect(totals()).toContainText('USD 20.00');
  await expect(totals()).toContainText('404 Income Error');
  await chips.getByRole('radio', { name: 'IDR' }).tap();
  await expect(totals()).toContainText('Rp1.402.500');
});

test('T4.32, T4.35, T4.39 previous periods, the arrows, the year view and the alarm', async () => {
  await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous period' }).tap();
  await expect(page.getByRole('heading', { name: monthOf(1).label })).toBeVisible();
  await expect(totals()).toContainText(`Rp500.000 more than ${monthOf(2).long}`);
  await expect(totals()).not.toContainText('so far');
  await expect(page.getByRole('radiogroup', { name: 'Currency' })).toHaveCount(0); // only rupiah there

  await page.getByRole('button', { name: 'Previous period' }).tap();
  await expect(page.getByRole('heading', { name: monthOf(2).label })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous period' })).toBeDisabled(); // the oldest entry
  await expect(totals()).toContainText('−25%');
  await expect(totals()).toContainText('Spent more than came in');
  const sign = totals().getByRole('img', { name: 'Warning' });
  await expect(sign).toBeVisible();
  // Reduced motion (the e2e setting): the alarm stays still.
  expect(await sign.evaluate(el => getComputedStyle(el).animationName)).toBe('none');

  await page.getByRole('radio', { name: 'Year' }).tap();
  await expect(page.getByRole('heading', { name: String(monthOf(2).year) })).toBeVisible();
  await expect(totals()).toContainText('Rp');
  if (monthOf(2).year === y) await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled(); // the running year
});

test('T3.33 the ? on Insights opens the budget words; closing hands focus back', async () => {
  const help = page.getByRole('button', { name: 'What the budget words mean' });
  await help.tap();
  const guide = page.getByRole('dialog', { name: 'Budget words' });
  for (const word of ['On track', 'Likely over', 'Over']) await expect(guide.getByText(word, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(help).toBeFocused();
  expect(errors).toEqual([]);
});

// ---- Step 5 ----

test('T5.22 the trend, Daily Wallet Spending, merchants and biggest expenses', async () => {
  const cat = await (await api('/catalog')).json() as { accounts: { id: string; name: string }[]; categories: { id: string; name: string }[] };
  const main = cat.accounts.find(a => a.name === 'Main Account')!.id;
  const food = cat.categories.find(x => x.name === 'Food & Drink')!.id;
  const commands = [
    { type: 'EXPENSE', accountId: main, categoryId: food, amount: 300_000, date: today, merchant: 'warung', split: { people: 3 } },
    { type: 'EXPENSE', accountId: main, categoryId: food, amount: 100_000, date: today, merchant: 'Indomaret' },
    { type: 'EXPENSE', accountId: main, categoryId: food, amount: 150_000, date: today, merchant: 'indomaret ' },
  ];
  expect((await api('/transactions', { commands })).ok()).toBe(true);
  // A budget made this cycle: the section shows, with no finished cycle yet.
  expect((await page.request.put('/api/budgets', { data: { categoryId: food, limit: 2_000_000 } })).ok()).toBe(true);
  await page.reload();
  await tab('Insights').tap();

  await expect(page.getByRole('heading', { name: 'Spending each day' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Spending each day' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Daily Wallet Spending' })).toBeVisible();
  const merchants = page.getByRole('figure', { name: 'Top merchants' }).getByRole('listitem');
  await expect(merchants).toHaveCount(2);
  await expect(merchants.nth(0)).toContainText('Indomaret');
  await expect(merchants.nth(0)).toContainText('2 visits');
  await expect(page.getByTestId('biggest-expenses').getByRole('listitem')).toHaveCount(5);
});

test('T5.37 tapping a bar names it in the readout', async () => {
  const trend = page.getByRole('figure', { name: 'Spending each day' });
  const todayBar = trend.getByRole('button').last();
  await todayBar.tap();
  await expect(todayBar).toHaveAttribute('aria-pressed', 'true');
  await expect(trend.getByTestId('bar-readout')).toContainText('Rp1.752.500');
  await todayBar.tap();
  await expect(todayBar).toHaveAttribute('aria-pressed', 'false');
});

test('T5.35 a category row lists its entries with counted amounts that add up', async () => {
  const label = monthOf(0).label.replace(/ cycle$/, '');
  await page.getByRole('figure', { name: 'Spending by category' }).getByRole('button', { name: /Food & Drink/ }).tap();
  const sheet = page.getByRole('dialog', { name: `Food & Drink · ${label}` });
  const rows = sheet.getByTestId('insights-entries').getByRole('button');
  await expect(rows).toHaveCount(4);
  const warung = rows.filter({ hasText: 'Warung' });
  await expect(warung).toContainText('You · counted');
  await expect(warung).toContainText('Person 3');
  await expect(sheet.getByTestId('insights-entries-total')).toHaveText('Rp900.000');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('T5.36 a merchant row lists that merchant whatever the spelling; an entry opens', async () => {
  await page.getByRole('figure', { name: 'Top merchants' }).getByRole('button', { name: /Indomaret/ }).tap();
  const sheet = page.getByRole('dialog', { name: /^Indomaret · / });
  const rows = sheet.getByTestId('insights-entries').getByRole('button');
  await expect(rows).toHaveCount(2);
  await expect(sheet.getByTestId('insights-entries-total')).toHaveText('Rp250.000');
  await rows.first().tap();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Edit' })).toBeHidden();
});

test('T5.23 a biggest expense opens its entry', async () => {
  await page.getByTestId('biggest-expenses').getByRole('button').first().tap();
  await expect(page.getByRole('dialog', { name: 'Edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Edit' })).toBeHidden();
});

// T5.24 (bars from seeded history) needs limits dated in past cycles, which the API cannot set; the service tests
// (T5.14 - T5.18) and the unit test (T5.34) cover it. Here: a new budget shows the section with its waiting note.
test('T5.25 Budgets over time shows for rupiah and hides for a currency with no budgets', async () => {
  await expect(page.getByRole('heading', { name: 'Budgets over time' })).toBeVisible();
  await expect(page.getByText('Shows here once a budget has run a full cycle.')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Currency' }).getByRole('radio', { name: 'USD' }).tap();
  await expect(totals()).toContainText('USD 20.00');
  await expect(page.getByRole('heading', { name: 'Budgets over time' })).toHaveCount(0);
  await page.getByRole('radiogroup', { name: 'Currency' }).getByRole('radio', { name: 'IDR' }).tap();
});

test('T5.26 the year view: 12 month slots', async () => {
  await page.getByRole('radio', { name: 'Year' }).tap();
  await expect(page.getByRole('heading', { name: 'Spending each month' })).toBeVisible();
  const months = page.getByRole('figure', { name: 'Spending each month' });
  await expect(months.getByRole('button')).toHaveCount(m); // Jan to this month have a value; the rest are empty slots
  await page.getByRole('radio', { name: 'Cycle' }).tap();
  expect(errors).toEqual([]);
});
