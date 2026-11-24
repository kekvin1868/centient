// End to end: cards & pay later, slice 3 (planning/features/product/cards-paylater.agent.md): paying and showing the
// one bill. The card's bill lists its lines (unpaid from the bill before, spending, interest); "Log interest" types
// the bank's interest from the statement with where it came from; "I paid it" takes any amount; Home shows what is
// left "After card bills". The clock is real: the card closed three days ago, so spending 40 days ago is on the
// bill before (never paid: it carries over), 5 days ago on the last bill, today on the next one. Skips the first
// run through the API and resets at the end, so the next file starts fresh.
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
const get = (path: string) => app.api('get', path);
const billBox = () => page.getByRole('region', { name: 'Card bill' });
const lines = () => billBox().getByRole('list', { name: 'Bill lines' });
/** One line of the receipt, by its name ("Spending, Rp300.000"). */
const row = (name: string | RegExp) => lines().getByRole('listitem', { name });

let card: { id: string };

test('the bill lists its lines; interest is logged from the statement with where it came from', async () => {
  await send('/accounts', { name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 });
  card = await send('/accounts', {
    name: 'Pay Card',
    kind: 'CREDIT_CARD',
    creditLimit: 10_000_000,
    statementDay: Number(daysAgo(3).slice(8)),
    dueDay: 28,
  });
  const spend = async (amount: number, date: string) =>
    send('/transactions', {
      type: 'EXPENSE',
      accountId: card.id,
      categoryId: await app.category('Food & Drink'),
      amount,
      date,
    });
  await spend(500_000, daysAgo(40));
  await spend(300_000, daysAgo(5));
  await spend(150_000, daysAgo(0));
  // A plan bought today: its slices ride later bills, but it can be where interest came from.
  await send('/installments', {
    accountId: card.id,
    name: 'Phone',
    amountPerInstallment: 100_000,
    installments: 3,
    paidCount: 0,
    myShare: 100_000,
    others: [],
    alreadyInBalance: false,
    categoryId: await app.category('Shopping'),
  });

  await page.reload();
  await app.tab('Money').tap();
  await app.pick('Pay Card');
  await expect(row(/^Unpaid from \w{3}, Rp500\.000$/)).toBeVisible();
  await expect(row('Spending, Rp300.000')).toBeVisible();
  await expect(row('Bill, Rp800.000')).toBeVisible();
  await expect(billBox()).toContainText('Rp150.000 spent since then goes on the next bill.');

  // The statement, typed in the paper's order: total, minimum, interest. The gap shows while typing.
  await billBox().getByRole('button', { name: 'Enter statement' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Enter statement' });
  // The Total starts at the app's bill and follows new interest, until it is typed.
  await expect(sheet.getByLabel('Total')).toHaveValue('800.000');
  await sheet.getByLabel('Interest (optional)').fill('10000');
  await expect(sheet.getByLabel('Total')).toHaveValue('810.000');
  await sheet.getByLabel('Interest (optional)').fill('');
  await expect(sheet.getByLabel('Total')).toHaveValue('800.000');
  // What the paper says: typed, it stays put.
  await sheet.getByLabel('Total').fill('845000');
  await expect(sheet.getByRole('status', { name: 'Statement check' })).toContainText(
    'The statement asks Rp45.000 more than the app has',
  );
  await sheet.getByLabel('Minimum payment (optional)').fill('84500');
  await sheet.getByLabel('Interest (optional)').fill('45000');
  await expect(
    sheet.getByRole('button', { name: 'Pick where the interest came from' }),
  ).toBeDisabled();
  await sheet.getByRole('combobox', { name: 'Charged on' }).selectOption({
    label: (await sheet.getByRole('option', { name: /^On unpaid/ }).textContent())!,
  });
  await expect(sheet.getByRole('status', { name: 'Statement check' })).toContainText(
    'Matches the app',
  );
  await sheet.getByRole('button', { name: 'Save statement' }).tap();
  await expect(sheet).toBeHidden();
  await expect(row(/^Interest · on unpaid \w{3}, Rp45\.000$/)).toBeVisible();
  await expect(row('Bill, Rp845.000')).toBeVisible();
  await expect(row('Bank statement, Rp845.000, match ✓')).toBeVisible();
  await expect(row('Minimum payment, Rp84.500')).toBeVisible();
  await expect(billBox()).toContainText('Matches statement ✓');
  await expect(billBox().getByRole('button', { name: 'Edit statement' })).toBeVisible();
  const bill = await app.bill(card.id);
  expect(bill.lines.interest).toMatchObject([{ from: bill.before, amount: 45_000 }]);

  // A wrong interest line is fixed from the bill: tapping it opens its entry.
  await lines()
    .getByRole('button', { name: /^Interest · on unpaid/ })
    .tap();
  const entry = page.getByRole('dialog', { name: 'Edit' });
  await expect(entry.getByLabel('Amount')).toHaveValue('45.000');
  await page.keyboard.press('Escape');
  await expect(entry).toBeHidden();
});

test('paying part of the bill shows it paid and leaves the rest; Home shows money after card bills', async () => {
  await billBox().getByRole('button', { name: 'I paid it' }).tap();
  const pay = page.getByRole('dialog', { name: 'Pay Pay Card' });
  await pay.getByLabel('Paid from').selectOption({ label: 'BCA' });
  await expect(pay.getByLabel('Amount')).toHaveValue('845.000');
  // The statement's minimum is offered next to the full amount.
  await pay.getByRole('button', { name: 'Minimum Rp84.500' }).tap();
  await expect(pay.getByLabel('Amount')).toHaveValue('84.500');
  await pay.getByLabel('Amount').fill('345000');
  await pay.getByRole('button', { name: 'Log the payment' }).tap();
  await expect(pay).toBeHidden();
  await expect(row(/^Paid since \d{1,2} \w{3}, −Rp345\.000$/)).toBeVisible();
  await expect(row('Left to pay, Rp500.000')).toBeVisible();
  const minimum = billBox().getByRole('status', { name: 'Minimum paid' });
  await expect(minimum).toContainText(/Rp500\.000 carries to the \w{3} bill/);
  await expect(minimum).toContainText('the bank will likely charge interest');
  const bill = await app.bill(card.id);
  expect(bill).toMatchObject({ left: 500_000, spentSince: 150_000 });

  // Your money less the 500rb left to pay and the 150rb spent since (the Phone's slices are left out).
  const accounts = (await get('/balances')).accounts as {
    kind: string;
    balance: number;
  }[];
  const money = accounts
    .filter(a => !['CREDIT_CARD', 'PAYLATER'].includes(a.kind))
    .reduce((s, a) => s + a.balance, 0);
  const rp = (n: number) => `Rp${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  await app.tab('Home').tap();
  const chip = page.getByRole('button', { name: /^Showing .*\. Change account$/ });
  if (!(await chip.getAttribute('aria-label'))!.startsWith('Showing all accounts')) {
    await chip.tap();
    const all = page
      .getByRole('dialog', { name: 'Pick an account' })
      .getByRole('button', { name: /^All accounts/ });
    await all.focus();
    await all.press('Enter');
  }
  await expect(page.getByRole('region', { name: 'Your money' })).toContainText(
    `After card bills · ${rp(money - 650_000)}`,
  );
  // Tapping it shows how it was worked out.
  await page.getByRole('button', { name: /^After card bills/ }).tap();
  const why = page.getByRole('dialog', { name: 'After card bills' });
  await expect(why).toContainText(`Your money${rp(money)}`);
  await expect(why).toContainText('− Pay Card bill leftRp500.000');
  await expect(why).toContainText('− Pay Card spent since closingRp150.000');
  await expect(why).toContainText(`= After card bills${rp(money - 650_000)}`);
  await page.keyboard.press('Escape');
  await expect(why).toBeHidden();
});

test('a statement that asks more than the app: the missing spend is logged from the bill', async () => {
  await app.tab('Money').tap();
  await app.pick('Pay Card');
  await billBox().getByRole('button', { name: 'Edit statement' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Enter statement' });
  await expect(sheet.getByLabel('Total')).toHaveValue('845.000'); // what was typed before
  // The interest already on the bill is listed, and its source is not offered again.
  await expect(sheet.getByRole('list', { name: 'Interest on this bill' })).toContainText(
    /on unpaid \w{3}/,
  );
  await expect(sheet.getByRole('option', { name: /^On unpaid/ })).toHaveCount(0);
  await sheet.getByLabel('Total').fill('900000');
  await sheet.getByRole('button', { name: 'Save statement' }).tap();
  await expect(sheet).toBeHidden();

  const gap = billBox().getByRole('status', { name: 'Statement gap' });
  await expect(gap).toContainText('Rp55.000 on the statement is not in the app');
  await gap.getByRole('button', { name: 'Log missing spending' }).tap();
  const entry = page.getByRole('dialog', { name: 'New entry' });
  await expect(entry.getByLabel('Amount')).toHaveValue('55.000');
  await entry.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Food & Drink' });
  await entry.getByRole('button', { name: 'Log it' }).tap();
  await expect(entry).toBeHidden();
  // On this bill (dated on its closing day), so the bill now matches.
  await expect(row('Bill, Rp900.000')).toBeVisible();
  await expect(billBox()).toContainText('Matches statement ✓');

  // Paid more than the bill (here on purpose; in life, a line removed after paying): a credit note says where
  // the extra goes.
  const left = (await app.bill(card.id)).left;
  await send('/transactions', {
    type: 'TRANSFER',
    fromAccountId: (await app.account('BCA')).id,
    toAccountId: card.id,
    amount: left + 50_000,
    date: daysAgo(0),
  });
  await page.reload();
  await app.tab('Money').tap();
  await app.pick('Pay Card');
  const extra = billBox().getByRole('status', { name: 'Paid extra' });
  await expect(extra).toContainText('+Rp50.000 paid extra');
  await expect(extra).toContainText(/counts toward your \w{3} bill/);
  await expect(row('Left to pay, Rp0')).toBeVisible();

  // A wrong interest line is removed from the bill itself: its entry's sheet has Delete (confirmed, 5 s to undo).
  // Already paid, so what it took off shows as paid extra.
  await lines()
    .getByRole('button', { name: /^Interest · on unpaid/ })
    .tap();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  await edit.getByRole('button', { name: 'Delete' }).tap();
  const ask = page.getByRole('dialog', { name: /^Delete .*Rp45\.000\?$/ });
  await ask.getByRole('button', { name: 'Delete' }).tap();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Deleted')).toBeVisible();
  await expect(row(/^Interest · on unpaid/)).toHaveCount(0, { timeout: 15_000 });
  await expect(extra).toContainText('+Rp95.000 paid extra');
});
