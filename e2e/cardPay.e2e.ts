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
  await expect(lines()).toContainText(/Unpaid from \w{3}Rp500\.000/);
  await expect(lines()).toContainText('SpendingRp300.000');
  await expect(lines()).toContainText('BillRp800.000');
  await expect(billBox()).toContainText('Rp150.000 spent since then goes on the next bill.');

  await billBox().getByRole('button', { name: 'Log interest' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Log interest' });
  await sheet.getByLabel('Amount').fill('45000');
  await expect(sheet.getByRole('button', { name: 'Pick where it came from' })).toBeDisabled();
  await sheet.getByRole('combobox', { name: 'Charged on' }).selectOption({
    label: (await sheet.getByRole('option', { name: /^On unpaid/ }).textContent())!,
  });
  await sheet.getByRole('button', { name: 'Log interest' }).tap();
  await expect(sheet).toBeHidden();
  await expect(lines()).toContainText(/Interest · on unpaid \w{3}Rp45\.000/);
  await expect(lines()).toContainText('BillRp845.000');
  const bill = await app.bill(card.id);
  expect(bill.lines.interest).toMatchObject([{ from: bill.before, amount: 45_000 }]);
});

test('paying part of the bill shows it paid and leaves the rest; Home shows money after card bills', async () => {
  await billBox().getByRole('button', { name: 'I paid it' }).tap();
  const pay = page.getByRole('dialog', { name: 'Pay Pay Card' });
  await pay.getByLabel('Paid from').selectOption({ label: 'BCA' });
  await expect(pay.getByLabel('Amount')).toHaveValue('845.000');
  await pay.getByLabel('Amount').fill('345000');
  await pay.getByRole('button', { name: 'Log the payment' }).tap();
  await expect(pay).toBeHidden();
  await expect(lines()).toContainText('Paid since−Rp345.000');
  await expect(billBox()).toContainText('Rp500.000');
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
});
