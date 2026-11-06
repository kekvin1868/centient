// End to end: the Insights tab (steps 4, 5 and 7). Four tabs, the empty state, totals and the comparison line, category bars
// with shares, the currency chips, previous / next / year, the savings rate's 404 and its nuclear alarm, and the `?`;
// then step 5: the trend and its readout, Daily average spendings, merchants, biggest expenses, the entries sheet with
// counted amounts, and Budgets over time.
// Runs first (alphabetical) on a fresh workspace, skips the first run through the API, and resets at the end so
// onboarding.e2e.ts still starts from a fresh first run. The server's clock is real, so dates are relative to today.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
const errors: string[] = [];
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
  await page.goto('/');
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const api = (path: string, data?: unknown) =>
  data === undefined ? page.request.get(`/api${path}`) : page.request.post(`/api${path}`, { data });
const jakartaDay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const today = jakartaDay();
const [y, m] = today.split('-').map(Number);
/** First day of the month `back` months ago, and its names. */
const monthOf = (back: number) => {
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  const name = (month: 'long' | 'short') =>
    d.toLocaleDateString('en-US', { month, timeZone: 'UTC' });
  return {
    first: d.toISOString().slice(0, 10),
    long: name('long'),
    label: `${name('short')} ${d.getUTCFullYear()} cycle`,
    year: d.getUTCFullYear(),
  };
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
  // Q45: nothing to export yet. Q44: the ? sits by the title.
  await expect(page.getByRole('button', { name: 'Report PDF' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toBeDisabled();
  const title = await page.getByRole('heading', { name: 'Insights', level: 1 }).boundingBox();
  const help = await page.getByRole('button', { name: 'What the budget words mean' }).boundingBox();
  expect(Math.abs(help!.y + help!.height / 2 - (title!.y + title!.height / 2))).toBeLessThan(
    title!.height / 2,
  );
  expect(help!.x).toBeGreaterThan(title!.x + title!.width);
  expect(errors).toEqual([]);
});

test('T4.30, T4.37 totals, savings rate, the comparison and category bars', async () => {
  const cat = (await (await api('/catalog')).json()) as {
    accounts: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
  const acc = (n: string) => cat.accounts.find(a => a.name === n)!.id;
  const c = (n: string) => cat.categories.find(x => x.name === n)!.id;
  const main = acc('Main Account');
  const wise = (await (
    await api('/accounts', { name: 'Wise', kind: 'BANK', currency: 'USD' })
  ).json()) as { id: string };
  const commands = [
    { type: 'INCOME', accountId: main, categoryId: c('Salary'), amount: 10_000_000, date: today },
    { type: 'EXPENSE', accountId: main, categoryId: c('Shopping'), amount: 800_000, date: today },
    {
      type: 'EXPENSE',
      accountId: main,
      categoryId: c('Food & Drink'),
      amount: 550_000,
      date: today,
    },
    { type: 'EXPENSE', accountId: main, categoryId: c('Transport'), amount: 50_000, date: today },
    {
      type: 'TRANSFER',
      fromAccountId: main,
      toAccountId: acc('Dailies'),
      amount: 1_000_000,
      fee: 2_500,
      date: today,
    },
    {
      type: 'EXPENSE',
      accountId: wise.id,
      categoryId: c('Food & Drink'),
      amount: 2_000,
      date: today,
    },
    // Last month's first day (inside the same days so far), and the month before: income under spending.
    {
      type: 'EXPENSE',
      accountId: main,
      categoryId: c('Food & Drink'),
      amount: 1_000_000,
      date: monthOf(1).first,
    },
    {
      type: 'EXPENSE',
      accountId: main,
      categoryId: c('Food & Drink'),
      amount: 500_000,
      date: monthOf(2).first,
    },
    {
      type: 'INCOME',
      accountId: main,
      categoryId: c('Salary'),
      amount: 400_000,
      date: monthOf(2).first,
    },
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
  const expected = [
    ['Shopping', '57%'],
    ['Food & Drink', '39%'],
    ['Transport', '4%'],
    ['Fees', '<1%'],
  ];
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
  if (monthOf(2).year === y)
    await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled(); // the running year
});

test('T3.33 the ? on Insights opens the budget words; closing hands focus back', async () => {
  const help = page.getByRole('button', { name: 'What the budget words mean' });
  await help.tap();
  const guide = page.getByRole('dialog', { name: 'Insights Glossary' });
  for (const word of ['On track', 'Likely over', 'Over'])
    await expect(guide.getByText(word, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(help).toBeFocused();
  expect(errors).toEqual([]);
});

// ---- Step 5 ----

test('T5.22 the trend, Daily average spendings, merchants and biggest expenses', async () => {
  const cat = (await (await api('/catalog')).json()) as {
    accounts: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
  const main = cat.accounts.find(a => a.name === 'Main Account')!.id;
  const food = cat.categories.find(x => x.name === 'Food & Drink')!.id;
  const commands = [
    {
      type: 'EXPENSE',
      accountId: main,
      categoryId: food,
      amount: 300_000,
      date: today,
      merchant: 'warung',
      split: { people: 3 },
    },
    {
      type: 'EXPENSE',
      accountId: main,
      categoryId: food,
      amount: 100_000,
      date: today,
      merchant: 'Indomaret',
    },
    {
      type: 'EXPENSE',
      accountId: main,
      categoryId: food,
      amount: 150_000,
      date: today,
      merchant: 'indomaret ',
    },
  ];
  expect((await api('/transactions', { commands })).ok()).toBe(true);
  // A budget made this cycle: the section shows, with no finished cycle yet.
  expect(
    (await page.request.put('/api/budgets', { data: { categoryId: food, limit: 2_000_000 } })).ok(),
  ).toBe(true);
  await page.reload();
  await tab('Insights').tap();

  await expect(page.getByRole('heading', { name: 'Daily spendings' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Daily spendings' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Daily average spendings' })).toBeVisible();
  const merchants = page.getByRole('figure', { name: 'Top merchants' }).getByRole('listitem');
  await expect(merchants).toHaveCount(2);
  await expect(merchants.nth(0)).toContainText('Indomaret');
  await expect(merchants.nth(0)).toContainText('2 visits');
  await expect(page.getByTestId('biggest-expenses').getByRole('listitem')).toHaveCount(5);
});

test('T5.37 tapping a bar names it in the readout', async () => {
  const trend = page.getByRole('figure', { name: 'Daily spendings' });
  const todayBar = trend.getByRole('button').last();
  await todayBar.tap();
  await expect(todayBar).toHaveAttribute('aria-pressed', 'true');
  await expect(trend.getByTestId('bar-readout')).toContainText('Rp1.752.500');
  await todayBar.tap();
  await expect(todayBar).toHaveAttribute('aria-pressed', 'false');
});

test('T5.35 a category row lists its entries with counted amounts that add up', async () => {
  const label = monthOf(0).label.replace(/ cycle$/, '');
  await page
    .getByRole('figure', { name: 'Spending by category' })
    .getByRole('button', { name: /Food & Drink/ })
    .tap();
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

test('T5.37 a split with named people lists them by their current name, with a sticker after a rename', async () => {
  const cat = (await (await api('/catalog')).json()) as {
    accounts: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
  const main = cat.accounts.find(a => a.name === 'Main Account')!.id;
  const food = cat.categories.find(x => x.name === 'Food & Drink')!.id;
  expect(
    (
      await api('/transactions', {
        commands: [
          {
            type: 'EXPENSE',
            accountId: main,
            categoryId: food,
            amount: 60_000,
            date: today,
            merchant: 'Kado',
            split: {
              people: 3,
              parties: [
                { name: 'Andi', share: 10_000 },
                { name: 'Budi', share: 20_000 },
              ],
            },
          },
        ],
      })
    ).ok(),
  ).toBe(true);
  const andi = (
    (await (await api('/catalog')).json()) as { accounts: { id: string; name: string }[] }
  ).accounts.find(a => a.name === 'Andi')!;
  expect(
    (await page.request.patch(`/api/accounts/${andi.id}`, { data: { name: 'Obang' } })).ok(),
  ).toBe(true);
  await page.reload();
  await tab('Insights').tap();
  await page
    .getByRole('figure', { name: 'Spending by category' })
    .getByRole('button', { name: /Food & Drink/ })
    .tap();
  const sheet = page.getByRole('dialog', { name: /^Food & Drink · / });
  const kado = sheet
    .getByTestId('insights-entries')
    .getByRole('button')
    .filter({ hasText: 'Kado' });
  await expect(kado).toContainText('You · counted');
  await expect(kado).toContainText('Obang');
  await expect(kado).toContainText('was Andi');
  await expect(kado).toContainText('Budi');
  await expect(kado).not.toContainText('Person 2');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // Deleting the tabs removes the split again, so the totals the next tests expect hold.
  for (const name of ['Obang', 'Budi'])
    await api(
      `/accounts/${((await (await api('/catalog')).json()) as { accounts: { id: string; name: string }[] }).accounts.find(a => a.name === name)!.id}`,
      { method: 'DELETE' },
    );
  await page.reload();
  await tab('Insights').tap();
});

test('T5.36 a merchant row lists that merchant whatever the spelling; an entry opens', async () => {
  await page
    .getByRole('figure', { name: 'Top merchants' })
    .getByRole('button', { name: /Indomaret/ })
    .tap();
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

test('Q48 the ? on Top merchants and on Biggest expenses opens one guide with the example', async () => {
  for (const title of ['Top merchants', 'Biggest expenses']) {
    const row = page.getByRole('heading', { name: title, exact: true }).locator('..');
    await row.getByRole('button', { name: 'How top merchants and biggest expenses differ' }).tap();
    const guide = page.getByRole('dialog', { name: 'Merchants vs expenses' });
    await expect(guide.getByTestId('lists-guide-table')).toContainText(
      'Indomaret · Rp250.000 · 2 visits',
    );
    await expect(guide.getByTestId('lists-guide-table')).toContainText('Shopping · Rp800.000');
    await page.keyboard.press('Escape');
    await expect(guide).toBeHidden();
  }
});

test('Q49 the ? on Daily spendings and on Daily average spendings opens one guide', async () => {
  for (const title of ['Daily spendings', 'Daily average spendings']) {
    const row = page.getByRole('heading', { name: title, exact: true }).locator('..');
    await row.getByRole('button', { name: 'How daily and daily average spendings differ' }).tap();
    const guide = page.getByRole('dialog', { name: 'Daily vs daily average' });
    await expect(guide).toContainText('which day of the week costs me most?');
    await expect(guide.getByTestId('charts-guide-summary')).toContainText('Saturday Rp250.000');
    await page.keyboard.press('Escape');
    await expect(guide).toBeHidden();
  }
});

// T5.24 (bars from seeded history) needs limits dated in past cycles, which the API cannot set; the service tests
// (T5.14 - T5.18) and the unit test (T5.34) cover it. Here: a new budget shows the section with its waiting note.
test('T5.25 Budgets over time shows for rupiah and hides for a currency with no budgets', async () => {
  await expect(page.getByRole('heading', { name: 'Budgets over time' })).toBeVisible();
  await expect(page.getByText('Shows here once a budget has run a full cycle.')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Currency' })
    .getByRole('radio', { name: 'USD' })
    .tap();
  await expect(totals()).toContainText('USD 20.00');
  await expect(page.getByRole('heading', { name: 'Budgets over time' })).toHaveCount(0);
  await page
    .getByRole('radiogroup', { name: 'Currency' })
    .getByRole('radio', { name: 'IDR' })
    .tap();
});

test('T5.26 the year view: 12 month slots', async () => {
  await page.getByRole('radio', { name: 'Year' }).tap();
  await expect(page.getByRole('heading', { name: 'Monthly spendings' })).toBeVisible();
  const months = page.getByRole('figure', { name: 'Monthly spendings' });
  await expect(months.getByRole('button')).toHaveCount(m); // Jan to this month have a value; the rest are empty slots
  await page.getByRole('radio', { name: 'Cycle' }).tap();
  expect(errors).toEqual([]);
});

// Step 7: the export row. The share sheet is stubbed: each shared file is kept on `window.__shared`; `__refuse` makes the
// next shares fail the way iOS does when the tap has expired.
type Shared = { name: string; type: string; text: string };
const shared = () => page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared);
const exportRow = () => page.getByRole('button', { name: 'Report PDF' }).locator('..');
const mm = String(m).padStart(2, '0');

test('T7.10, T7.11 CSV for this currency, then all currencies, through the share sheet', async () => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: unknown[]; __refuse: number };
    w.__shared = [];
    w.__refuse = 0;
    navigator.canShare = () => true;
    navigator.share = async (d?: ShareData) => {
      if (w.__refuse > 0) {
        w.__refuse--;
        throw new DOMException('The tap has expired', 'NotAllowedError');
      }
      const f = d!.files![0];
      w.__shared.push({ name: f.name, type: f.type, text: (await f.text()).slice(0, 4000) });
    };
  });
  await page.reload();
  await tab('Insights').tap();
  await page.getByRole('button', { name: 'CSV', exact: true }).tap();
  const sheet = page.getByRole('dialog', {
    name: `Export CSV · ${monthOf(0).label.replace(/ cycle$/, '')}`,
  });
  await sheet.getByRole('button', { name: 'IDR only' }).tap();
  await expect.poll(async () => (await shared()).length).toBe(1);
  const [idr] = await shared();
  expect(idr.name).toBe(`centient-${y}-${mm}-IDR.csv`);
  const rows = idr.text.split('\n').slice(1);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(r => r.includes(',IDR,') && r.startsWith(`${y}-${mm}`))).toBe(true);

  await page.getByRole('button', { name: 'CSV', exact: true }).tap();
  await sheet.getByRole('button', { name: 'All currencies' }).tap();
  await expect.poll(async () => (await shared()).length).toBe(2);
  const all = (await shared())[1];
  expect(all.name).toBe(`centient-${y}-${mm}-all.csv`);
  expect(all.text).toContain(',IDR,');
  expect(all.text).toContain(',USD,');
});

test('T7.14 Report PDF: one A4 PDF named by period and currency; dark mode comes back', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Report PDF' }).tap();
  await expect.poll(async () => (await shared()).length, { timeout: 20_000 }).toBe(3);
  const pdf = (await shared())[2];
  expect(pdf).toMatchObject({ name: `centient-${y}-${mm}-IDR.pdf`, type: 'application/pdf' });
  expect(pdf.text.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.text).toMatch(/\/Type \/Pages \/Count [1-9]/);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('status').filter({ hasText: 'Making PDF…' })).toHaveCount(0); // the cover is gone
  await expect(page.getByRole('button', { name: 'Report PDF' })).toBeEnabled();
  await page.emulateMedia({ colorScheme: 'light' });
});

test('T7.15 when the share is refused, the button offers a second tap with the file ready', async () => {
  await page.evaluate(() => {
    (window as unknown as { __refuse: number }).__refuse = 1;
  });
  await page.getByRole('button', { name: 'Report PDF' }).tap();
  await expect(page.getByRole('button', { name: 'Share PDF' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Share PDF' }).tap();
  await expect.poll(async () => (await shared()).length).toBe(4);
  expect((await shared())[3].name).toBe(`centient-${y}-${mm}-IDR.pdf`);
  await expect(page.getByRole('button', { name: 'Report PDF' })).toBeVisible();
});

test('T7.16 without file sharing the CSV downloads', async () => {
  await page.evaluate(() => {
    (navigator as { canShare?: unknown }).canShare = undefined;
  });
  await page.getByRole('button', { name: 'CSV', exact: true }).tap();
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: /^Export CSV/ })
    .getByRole('button', { name: 'IDR only' })
    .tap();
  expect((await download).suggestedFilename()).toBe(`centient-${y}-${mm}-IDR.csv`);
  await expect(exportRow()).toBeVisible();
  expect(errors).toEqual([]);
});
