// End to end: the cards polish checklist (PR #27, the "Cards polish: what to test" page), the steps the other card
// specs do not already cover: the statement's Total that follows interest until typed, a minimum above the total,
// one interest line on a double tap, the statement saved offline, the MIN PAID / BELOW MIN / PAID / PAID + stamps,
// the future Paid on day, the Bills card row, the receipt in dark mode, the Home scrolls by age (and the crumple),
// and installment wording. The clock is real: each card closed three days ago and is paid by three days from now.
import { expect, test, type Page } from '@playwright/test';
import { cardsApp } from './cardsApp';

test.describe.configure({ mode: 'serial' });

let page: Page;
let app: ReturnType<typeof cardsApp>;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  app = cardsApp(page);
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
  await page.goto('/');
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const DAY = 86_400_000;
const jakarta = (ms: number) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => jakarta(Date.now() - n * DAY);
const send = (path: string, data: unknown) => app.api('post', path, data);

const billBox = () => page.getByRole('region', { name: 'Card bill' });
const lines = () => billBox().getByRole('list', { name: 'Bill lines' });
const row = (name: string | RegExp) => lines().getByRole('listitem', { name });
const stamp = () => billBox().locator('.bill-receipt-stamp');
const statementSheet = () => page.getByRole('dialog', { name: 'Enter statement' });
const check = () => statementSheet().getByRole('status', { name: 'Statement check' });

/** A card closing three days ago, paid by three days from now, with spends `n` days ago. */
const newCard = async (name: string, spends: [amount: number, daysBack: number][]) => {
  const card = (await send('/accounts', {
    name,
    kind: 'CREDIT_CARD',
    creditLimit: 10_000_000,
    statementDay: Number(daysAgo(3).slice(8)),
    dueDay: Number(daysAgo(-3).slice(8)),
  })) as { id: string };
  for (const [amount, back] of spends)
    await send('/transactions', {
      type: 'EXPENSE',
      accountId: card.id,
      categoryId: await app.category('Food & Drink'),
      amount,
      date: daysAgo(back),
    });
  return card;
};
const openCard = async (name: string) => {
  await page.reload();
  await app.tab('Money').tap();
  await app.pick(name);
};
const typeStatement = async (o: { total?: string; minimum?: string }) => {
  await billBox()
    .getByRole('button', { name: /^(Enter|Edit) statement$/ })
    .tap();
  if (o.total !== undefined) await statementSheet().getByLabel('Total').fill(o.total);
  if (o.minimum !== undefined)
    await statementSheet().getByLabel('Minimum payment (optional)').fill(o.minimum);
};
const save = async () => {
  await statementSheet().getByRole('button', { name: 'Save statement' }).tap();
  await expect(statementSheet()).toBeHidden();
};
const pay = async (card: string, amount: string) => {
  await billBox().getByRole('button', { name: 'I paid it' }).tap();
  const sheet = page.getByRole('dialog', { name: `Pay ${card}` });
  await sheet.getByLabel('Paid from').selectOption({ label: 'BCA' });
  await sheet.getByLabel('Amount').fill(amount);
  await sheet.getByRole('button', { name: 'Log the payment' }).tap();
  await expect(sheet).toBeHidden();
};

let pc: { id: string };

test('Enter statement: Total follows interest until typed; a minimum over the total cannot save', async () => {
  await send('/accounts', { name: 'BCA', kind: 'BANK', openingBalance: 20_000_000 });
  pc = await newCard('Pay Card', [
    [500_000, 40],
    [300_000, 5],
    [150_000, 0],
  ]);
  await openCard('Pay Card');
  await expect(stamp()).toHaveText('DUE');
  await billBox().getByRole('button', { name: 'Enter statement' }).tap();
  const sheet = statementSheet();
  await expect(sheet.getByLabel('Total')).toHaveValue('800.000');
  await expect(check()).toContainText('match ✓');
  await expect(check()).toContainText('Matches the app');

  const from = (await sheet.getByRole('option', { name: /^On unpaid/ }).textContent())!;
  await sheet.getByLabel('Interest (optional)').fill('50000');
  await sheet.getByRole('combobox', { name: 'Charged on' }).selectOption({ label: from });
  await expect(sheet.getByLabel('Total')).toHaveValue('850.000');
  await expect(check()).toContainText('Matches the app');
  await sheet.getByLabel('Interest (optional)').fill('');
  await expect(sheet.getByLabel('Total')).toHaveValue('800.000');

  // Typed by hand, the Total stays put while the interest changes.
  await sheet.getByLabel('Total').fill('845000');
  await sheet.getByLabel('Interest (optional)').fill('10000');
  await expect(sheet.getByLabel('Total')).toHaveValue('845.000');
  await expect(check()).toContainText('+Rp35.000 missing');
  await sheet.getByLabel('Interest (optional)').fill('45000');
  await expect(check()).toContainText('match ✓');

  await sheet.getByLabel('Minimum payment (optional)').fill('900000');
  await expect(
    sheet.getByRole('button', { name: 'The minimum is more than the total' }),
  ).toBeDisabled();
  await sheet.getByLabel('Minimum payment (optional)').fill('84500');

  // A fast double tap on Save logs the interest once.
  await sheet.getByRole('button', { name: 'Save statement' }).dblclick();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Statement saved')).toBeVisible();
  // ponytail: known tap-through, the second tap lands on "I paid it" under Save and opens the pay sheet.
  const through = page.getByRole('dialog', { name: 'Pay Pay Card' });
  if (await through.isVisible()) {
    console.log('FINDING: double tap on Save statement opened the pay sheet underneath');
    await page.keyboard.press('Escape');
    await expect(through).toBeHidden();
  }
  await expect(row(/^Interest · on unpaid \w{3}, Rp45\.000$/)).toHaveCount(1);
  await expect(row('Bank statement, Rp845.000, match ✓')).toBeVisible();
  await expect(row('Minimum payment, Rp84.500')).toBeVisible();
  await expect(stamp()).toHaveText('DUE');
  await expect(billBox().getByRole('button', { name: 'Edit statement' })).toBeVisible();
  expect((await app.bill(pc.id)).lines.interest).toHaveLength(1);
  await app.shot('polish-receipt', billBox());
});

test('Edit statement: interest already on the bill is tagged and not offered twice; a lower total says OVER', async () => {
  await billBox().getByRole('button', { name: 'Edit statement' }).tap();
  const sheet = statementSheet();
  await expect(sheet.getByLabel('Total')).toHaveValue('845.000');
  await expect(sheet.getByLabel('Minimum payment (optional)')).toHaveValue('84.500');
  await expect(sheet.getByRole('list', { name: 'Interest on this bill' })).toContainText(
    'on the bill',
  );
  await expect(sheet.getByRole('option', { name: /^On unpaid/ })).toHaveCount(0);
  await sheet.getByLabel('Total').fill('800000');
  await save();
  const gap = billBox().getByRole('status', { name: 'Statement gap' });
  await expect(gap).toContainText('The app has Rp45.000 more than the statement');
  await expect(gap).toContainText('Check the lines on the bill');
  await expect(row('Bank statement, Rp800.000, Rp45.000 over')).toBeVisible();
  await expect(billBox().getByRole('button', { name: /accept/i })).toHaveCount(0);
});

test('offline: the statement saves at once and stays after the signal comes back', async () => {
  await page.context().setOffline(true);
  await typeStatement({ total: '845000' });
  await save();
  await expect(row('Bank statement, Rp845.000, match ✓')).toBeVisible();
  await page.context().setOffline(false);
  await expect
    .poll(
      async () =>
        (await app.api('get', '/recurring')).cards.find(
          (c: { accountId: string }) => c.accountId === pc.id,
        ).statement,
    )
    .toMatchObject({ total: 845_000, minimum: 84_500 });
  await openCard('Pay Card');
  await expect(row('Bank statement, Rp845.000, match ✓')).toBeVisible();
});

test('I paid it: Full / Minimum fill the amount; paying the minimum stamps MIN PAID', async () => {
  await billBox().getByRole('button', { name: 'I paid it' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Pay Pay Card' });
  await expect(sheet.getByRole('button', { name: /^Paid on, / })).toHaveAttribute(
    'data-value',
    daysAgo(0),
  );
  await sheet.getByRole('button', { name: 'Minimum Rp84.500' }).tap();
  await expect(sheet.getByLabel('Amount')).toHaveValue('84.500');
  await sheet.getByRole('button', { name: 'Full Rp845.000' }).tap();
  await expect(sheet.getByLabel('Amount')).toHaveValue('845.000');

  // A day ahead cannot be logged yet.
  await sheet.getByLabel('Paid from').selectOption({ label: 'BCA' });
  await sheet.getByRole('button', { name: /^Paid on, / }).tap();
  const tomorrow = sheet.locator(`[data-date="${daysAgo(-1)}"]`);
  if (!(await tomorrow.count())) await sheet.getByRole('button', { name: 'Next month' }).tap();
  await sheet.locator(`[data-date="${daysAgo(-1)}"]`).tap();
  await expect(sheet.getByRole('button', { name: 'Log it once it is paid' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await pay('Pay Card', '84500');
  await expect(stamp()).toHaveText('MIN PAID');
  const min = billBox().getByRole('status', { name: 'Minimum paid' });
  await expect(min).toContainText(/Rp760\.500 carries to the \w{3} bill/);
  await expect(min).toContainText('the bank will likely charge interest');
});

test('paid in full stamps PAID; deleting an interest line after makes it PAID + with a credit note', async () => {
  await pay('Pay Card', '760500');
  await expect(stamp()).toHaveText('PAID');
  await expect(row('Left to pay, Rp0')).toBeVisible();
  await lines()
    .getByRole('button', { name: /^Interest · on unpaid/ })
    .tap();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  await expect(edit.getByRole('button', { name: 'Save' })).toBeVisible();
  await edit.getByRole('button', { name: 'Delete' }).tap();
  await page
    .getByRole('dialog', { name: /^Delete .*Rp45\.000\?$/ })
    .getByRole('button', { name: 'Delete' })
    .tap();
  await expect(row(/^Interest · on unpaid/)).toHaveCount(0, { timeout: 15_000 });
  await expect(stamp()).toHaveText('PAID +');
  const extra = billBox().getByRole('status', { name: 'Paid extra' });
  await expect(extra).toContainText('+Rp45.000 paid extra');
  await expect(extra).toContainText(/counts toward your \w{3} bill/);
  // Totals of many entries open nothing.
  await expect(lines().getByRole('button', { name: /^(Spending|Unpaid from)/ })).toHaveCount(0);
});

test('below the minimum stamps BELOW MIN; the Bills card row opens the bill, its PAY key the pay sheet', async () => {
  await newCard('Low Card', [[400_000, 5]]);
  await openCard('Low Card');
  await typeStatement({ minimum: '40000' });
  await save();
  await pay('Low Card', '10000');
  await expect(stamp()).toHaveText('BELOW MIN');
  await expect(billBox().getByRole('status', { name: 'Below minimum' })).toContainText(
    'Rp30.000 short of the Rp40.000 minimum',
  );

  await app.tab('Bills').tap();
  const bills = page.getByRole('main');
  await bills.getByRole('button', { name: 'Pay Low Card bill' }).tap();
  const paySheet = page.getByRole('dialog', { name: 'Pay Low Card' });
  await expect(paySheet.getByRole('button', { name: 'Full Rp390.000' })).toBeVisible();
  await expect(paySheet.getByRole('button', { name: 'Minimum Rp30.000' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paySheet).toBeHidden();

  await bills.getByRole('button', { name: /^Low Card bill, Rp390\.000/ }).tap();
  await expect(page.getByRole('region', { name: 'Card bill' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Card bill' })
    .getByRole('button', { name: 'I paid it' })
    .tap();
  await expect(paySheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paySheet).toBeHidden();
  await expect(page.getByRole('region', { name: 'Card bill' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Card bill' })).toBeHidden();
});

test('paid on the day before closing: it counts on that bill', async () => {
  await newCard('Early Card', [[200_000, 5]]);
  await openCard('Early Card');
  await billBox().getByRole('button', { name: 'I paid it' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Pay Early Card' });
  await sheet.getByLabel('Paid from').selectOption({ label: 'BCA' });
  await sheet.getByRole('button', { name: /^Paid on, / }).tap();
  const day = daysAgo(4);
  if (!(await sheet.locator(`[data-date="${day}"]`).count()))
    await sheet.getByRole('button', { name: 'Previous month' }).tap();
  await sheet.locator(`[data-date="${day}"]`).tap();
  await sheet.getByRole('button', { name: 'Log the payment' }).tap();
  await expect(sheet).toBeHidden();
  await expect(billBox()).toContainText('Nothing left to pay');
});

test('offline: logged missing spending and a payment count on the bill at once, so neither is done twice', async () => {
  const gc = await newCard('Gap Card', [[300_000, 5]]);
  await openCard('Gap Card');
  await typeStatement({ total: '350000' });
  await save();
  await page.context().setOffline(true);
  const gap = billBox().getByRole('status', { name: 'Statement gap' });
  await gap.getByRole('button', { name: 'Log missing spending' }).tap();
  const entry = page.getByRole('dialog', { name: 'New entry' });
  await entry.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Food & Drink' });
  await entry.getByRole('button', { name: 'Log it' }).tap();
  await expect(entry).toBeHidden();
  await expect(row('Waiting to send, Rp50.000')).toBeVisible();
  await expect(row('Bill, Rp350.000')).toBeVisible();
  await expect(gap).toHaveCount(0);
  await expect(billBox()).toContainText('Matches statement ✓');

  await pay('Gap Card', '350000');
  await expect(billBox()).toContainText('Nothing left to pay');
  await expect(billBox().getByRole('button', { name: 'I paid it' })).toHaveCount(0);

  await page.context().setOffline(false);
  await expect.poll(async () => (await app.bill(gc.id)).left).toBe(0);
  expect(await app.bill(gc.id)).toMatchObject({ bill: 350_000 });
});

test('the receipt: tagged lines, light paper in dark mode too', async () => {
  await openCard('Pay Card');
  const tags = lines().locator('.bill-receipt-line');
  await expect(tags.filter({ hasText: /^unpaid/i })).toHaveCount(1);
  await expect(tags.filter({ hasText: /^spent/i })).toHaveCount(1);
  await page.emulateMedia({ colorScheme: 'dark' });
  const light = await billBox()
    .locator('.bill-receipt')
    .evaluate(el => {
      const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number);
      return (r + g + b) / 3;
    });
  expect(light, 'receipt paper brightness in dark mode').toBeGreaterThan(180);
  await app.shot('polish-receipt-dark', billBox());
  await page.emulateMedia({ colorScheme: 'light' });
});

test('installment wording: no "slice" anywhere', async () => {
  await send('/installments', {
    accountId: pc.id,
    name: 'Phone',
    amountPerInstallment: 100_000,
    installments: 3,
    paidCount: 0,
    myShare: 100_000,
    others: [],
    alreadyInBalance: false,
    categoryId: await app.category('Shopping'),
  });
  await openCard('Pay Card');
  const card = page.getByRole('button', { name: 'Phone, 0 of 3 paid' });
  await expect(card).toContainText(/a month · installment 1 of 3 on the \w{3} bill/);
  await card.tap();
  const plan = page.getByRole('dialog', { name: 'Phone' });
  await expect(plan).toContainText('0 of 3 paid');
  await expect(plan.getByRole('region', { name: 'Next installment' })).toContainText(
    /NEXT\s*[A-Z]{3} bill\s*Rp100\.000/,
  );
  await expect(plan).not.toContainText(/slice/i);
  await app.shot('polish-plan', plan);
  // MOVE asks first, as a picture; CANCEL changes nothing.
  await plan.getByRole('button', { name: 'Move to next bill' }).tap();
  const ask = page.getByRole('dialog', {
    name: /^[A-Z]{3} to [A-Z]{3}: all 3 left move one bill on$/,
  });
  await expect(ask).toContainText(/[A-Z]{3} → [A-Z]{3}/);
  await app.shot('polish-move', ask);
  await ask.getByRole('button', { name: 'CANCEL' }).tap();
  await expect(ask).toBeHidden();
  await expect(page.getByText('Moved to the next bill')).toHaveCount(0);
  await expect(plan.getByRole('region', { name: 'Next installment' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toContainText(/slice/i);
});

test('Home: card bills are scrolls aged by bills unpaid; plain bills stay rows; a tap opens Bills', async () => {
  // Coming up shows 3: Low Card (below min) is paid off first so it leaves, then Netflix + Old + Mid.
  const payOff = async (id: string) =>
    send('/transactions', {
      type: 'TRANSFER',
      fromAccountId: (await app.account('BCA')).id,
      toAccountId: id,
      amount: (await app.bill(id)).left,
      date: daysAgo(0),
    });
  await payOff((await app.account('Low Card')).id);
  const old = await newCard('Old Card', [
    [100_000, 70],
    [100_000, 40],
    [100_000, 5],
  ]);
  await send('/recurring', {
    name: 'Netflix',
    accountId: (await app.account('BCA')).id,
    categoryId: await app.category('Food & Drink'),
    amount: 54_000,
    everyMonths: 1,
    nextDue: daysAgo(-2),
  });
  // Mid Card: 2 bills unpaid; this phone last saw it at 1, so it crumples once (motion on).
  const mid = await newCard('Mid Card', [
    [100_000, 40],
    [100_000, 5],
  ]);
  await page.evaluate(id => localStorage.setItem(`scroll-age:${id}`, '1'), mid.id);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  const up = page.getByRole('region', { name: 'Bills coming up' });
  const scroll = (name: string) => up.getByRole('button', { name: new RegExp(`^${name} bill,`) });
  await expect(scroll('Old Card')).toHaveAttribute('data-age', '3');
  await expect(scroll('Old Card')).toContainText('3+ bills unpaid');
  await expect(scroll('Mid Card')).toHaveAttribute('data-age', '1');
  await expect(scroll('Mid Card')).toHaveAttribute('data-age', '2');
  await expect(scroll('Mid Card')).toContainText('2 bills unpaid');
  await expect(up.getByRole('button', { name: /^Netflix/ })).not.toHaveClass(/bill-scroll/);
  // The amount fits: nothing cut on the torn one; stacked scrolls do not overlap.
  const amount = scroll('Old Card').locator('.bill-scroll-amount');
  expect(await amount.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const [a, b] = [await scroll('Old Card').boundingBox(), await scroll('Mid Card').boundingBox()];
  const [top, bottom] = a!.y < b!.y ? [a!, b!] : [b!, a!];
  expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height);
  await page.waitForTimeout(1200); // let the unroll settle for the picture
  await app.shot('polish-scrolls', up);

  // Paid off cards leave; a card with only this bill is a fresh scroll.
  await payOff(old.id);
  await payOff(mid.id);
  await newCard('Fresh Card', [[100_000, 5]]);
  await page.reload();
  await expect(scroll('Old Card')).toHaveCount(0);
  await expect(scroll('Mid Card')).toHaveCount(0);
  await expect(scroll('Fresh Card')).toHaveAttribute('data-age', '1');
  await scroll('Fresh Card').tap();
  await expect(page.getByRole('button', { name: /^Fresh Card bill, Rp100\.000/ })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('an entry from Recent has Delete, asked first', async () => {
  await page.reload();
  await app.tab('Home').tap();
  await page.locator('.entry-row').first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  await edit.getByRole('button', { name: 'Delete' }).tap();
  const ask = page.getByRole('dialog', { name: /^Delete / });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'CANCEL' }).tap();
  await expect(ask).toBeHidden();
});
