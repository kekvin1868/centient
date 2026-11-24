// End to end: cards & pay later, slice 2 (planning/features/product/cards-paylater.agent.md): one bill like the
// bank. A plan's slice rides the bill, never its price; the daily job (run here by Miniflare's scheduled trigger,
// `/cdn-cgi/local/scheduled`) posts each slice's interest once at its closing; an interest line deleted by hand
// stays deleted; "Move to next bill" takes the slice and its interest off this bill; a plan bought after the closing
// waits for the next bill; deleting the purchase takes the plan. The clock is real, so each card closes today (its
// spending today is on the bill that just closed) or yesterday (today's is on the next one). Skips the first run
// through the API and resets at the end, so the next file starts fresh.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
  await page.goto('/');
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const DAY = 86_400_000;
const jakarta = (ms: number) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const today = jakarta(Date.now());
const daysAgo = (n: number) => jakarta(Date.now() - n * DAY);
const dayOf = (d: string) => Number(d.slice(8));

const send = async (method: 'post' | 'delete', path: string, data?: unknown) => {
  const r = await page.request[method](`/api${path}`, { data });
  expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBe(true);
  return r.json();
};
const get = async (path: string) => (await page.request.get(`/api${path}`)).json();
const balance = async (id: string) =>
  ((await get('/balances')).accounts as { id: string; balance: number }[]).find(a => a.id === id)!
    .balance;
type CardBill = {
  accountId: string;
  bill: number;
  left: number;
  lines: {
    slices: { name: string; no: number; amount: number }[];
    interest: { entryId: string; no: number; amount: number }[];
  };
};
const cardBill = async (id: string) =>
  ((await get('/recurring')).cards as CardBill[]).find(c => c.accountId === id)!;
/** The daily job, as of now. */
const runDailyJob = async () =>
  expect((await page.request.get('/cdn-cgi/local/scheduled')).ok()).toBe(true);

const category = async (name: string) =>
  ((await get('/catalog')).categories as { id: string; name: string }[]).find(c => c.name === name)!
    .id;
const accountId = async (name: string) =>
  ((await get('/catalog')).accounts as { id: string; name: string }[]).find(a => a.name === name)!
    .id;
/** A credit card with a 10jt limit closing on `closes`'s day, paid by the 28th. */
const newCard = (name: string, closes: string) =>
  send('post', '/accounts', {
    name,
    kind: 'CREDIT_CARD',
    creditLimit: 10_000_000,
    statementDay: dayOf(closes),
    dueDay: 28,
  }) as Promise<{ id: string }>;
const spend = async (accountId: string, amount: number, date: string, merchant: string) =>
  send('post', '/transactions', {
    type: 'EXPENSE',
    accountId,
    categoryId: await category('Food & Drink'),
    amount,
    date,
    merchant,
  });
/** A 3jt TV on 6 × 525rb, logged on the card today: 25rb interest a slice. */
const tvWithInterest = async (accountId: string) =>
  send('post', '/installments', {
    accountId,
    name: 'TV',
    amountPerInstallment: 525_000,
    installments: 6,
    price: 3_000_000,
    paidCount: 0,
    myShare: 525_000,
    others: [],
    alreadyInBalance: false,
    categoryId: await category('Shopping'),
  }) as Promise<{ id: string }>;

const tab = (name: string) => page.getByRole('button', { name, exact: true });
const billBox = () => page.getByRole('region', { name: 'Card bill' });
async function openMoney(name: string) {
  await page.reload();
  await tab('Money').tap();
  const card = page
    .getByRole('group', { name: 'Accounts' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
  await card.focus();
  await card.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

test('a plan added on Money: its slice is on the bill, its whole price only on the limit', async () => {
  const card = await newCard('Gadget Card', today);
  await spend(card.id, 200_000, today, 'dinner');
  await openMoney('Gadget Card');

  await page.getByRole('button', { name: 'Add installments' }).tap();
  const form = page.getByRole('dialog', { name: 'Add installments' });
  // No due date to pick: the next installment rides the card's next bill.
  await expect(form.getByText('First due')).toHaveCount(0);
  await expect(form).toContainText("The next installment goes on Gadget Card's next bill.");
  await form.getByRole('textbox', { name: 'What' }).fill('Phone');
  await form.getByRole('textbox', { name: 'Each installment' }).fill('500000');
  const installments = form.locator('li', { hasText: 'Installments' }).getByRole('button');
  for (let n = 3; n < 6; n++) await installments.last().tap(); // 3 -> 6
  const inBalance = form.getByRole('checkbox', { name: "Already in Gadget Card's balance" });
  await form.getByText("Already in Gadget Card's balance").tap();
  await expect(inBalance).not.toBeChecked();
  await form.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Shopping' });
  await form.getByRole('button', { name: 'Add installments' }).tap();
  await expect(form).toBeHidden();

  // The 3jt price and the dinner use the limit; the bill that closed today asks the dinner + slice 1.
  expect(await balance(card.id)).toBe(-3_200_000);
  await expect(page.getByText('Used Rp3.200.000 of Rp10.000.000')).toBeVisible();
  await expect(billBox()).toContainText('Rp700.000');
  await expect(billBox()).not.toContainText('Rp3.200.000');
  expect((await cardBill(card.id)).lines.slices).toMatchObject([
    { name: 'Phone', no: 1, amount: 500_000 },
  ]);

  // Each installment is due on its bill's pay-by day, a month apart.
  await page.getByRole('button', { name: 'Phone, 0 of 6 paid' }).tap();
  const plan = page.getByRole('dialog', { name: 'Phone' });
  await expect(plan.locator('[data-installment]')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(plan).toBeHidden();
  // The installment's line on the bill opens the same plan.
  await billBox()
    .getByRole('button', { name: /^Phone 1\/6/ })
    .tap();
  await expect(plan.locator('[data-installment]')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(plan).toBeHidden();
});

test('deleting the purchase takes its plan with it', async () => {
  const id = await accountId('Gadget Card');
  const { items } = await get(`/entries?account=${id}&merchant=phone`);
  expect(items).toHaveLength(1);
  await send('delete', `/entries/${items[0].id}`);

  await openMoney('Gadget Card');
  await expect(page.getByRole('button', { name: /^Phone, / })).toHaveCount(0);
  await expect(billBox()).toContainText('Rp200.000'); // the dinner only
  expect(await balance(id)).toBe(-200_000);
});

test('the daily job posts a slice its interest once, as its own line on the bill', async () => {
  const card = await newCard('TV Card', today);
  await tvWithInterest(card.id);
  await openMoney('TV Card');
  await expect(billBox()).toContainText('Rp500.000');

  await runDailyJob();
  await expect.poll(async () => (await cardBill(card.id)).left).toBe(525_000);
  await runDailyJob(); // a second run the same day posts nothing more
  const bill = await cardBill(card.id);
  expect(bill.lines.interest).toMatchObject([{ no: 1, amount: 25_000 }]);
  expect(bill.lines.slices).toMatchObject([{ name: 'TV', no: 1, amount: 500_000 }]);

  // It is an ordinary expense on the card, in Fees & Interests & Interests.
  const { items } = await get(`/entries?account=${card.id}&type=EXPENSE`);
  expect(items).toHaveLength(2); // the TV and its interest
  await openMoney('TV Card');
  await expect(billBox()).toContainText('Rp525.000');
});

test('an interest line deleted by hand (the bank waived it) is not posted again', async () => {
  const id = await accountId('TV Card');
  const [line] = (await cardBill(id)).lines.interest;
  await send('delete', `/entries/${line.entryId}`);
  await runDailyJob();
  await expect.poll(async () => (await cardBill(id)).lines.interest).toEqual([]);
  await openMoney('TV Card');
  await expect(billBox()).toContainText('Rp500.000');
});

test('Move to next bill takes the slice and its interest off this bill', async () => {
  const card = await newCard('Late Start', today);
  await tvWithInterest(card.id);
  await runDailyJob();
  await expect.poll(async () => (await cardBill(card.id)).left).toBe(525_000);

  await openMoney('Late Start');
  await page.getByRole('button', { name: 'TV, 0 of 6 paid' }).tap();
  const plan = page.getByRole('dialog', { name: 'TV' });
  await expect(plan).toContainText("If Late Start's bill didn't have it yet");
  await plan.getByRole('button', { name: 'Move to next bill' }).tap();
  // Asked first: what moves, and the interest that comes off for now.
  const ask = page.getByRole('dialog', { name: /^Every installment moves one bill later/ });
  await expect(ask).toContainText('Rp25.000 on installment 1');
  await ask.getByRole('button', { name: 'Move to next bill' }).tap();
  await expect(page.getByText('Moved to the next bill')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(billBox()).toContainText('Nothing left to pay');

  const bill = await cardBill(card.id);
  expect(bill).toMatchObject({ bill: 0, lines: { slices: [], interest: [] } });
  // Its next closing has not come: the job posts nothing until then.
  await runDailyJob();
  expect((await cardBill(card.id)).lines.interest).toEqual([]);
  expect(await balance(card.id)).toBe(-3_000_000); // the price still uses the limit
});

test('a plan bought after the closing waits for the next bill; spent since leaves its price out', async () => {
  const yesterday = daysAgo(1);
  const card = await newCard('Shopee Card', yesterday);
  await spend(card.id, 1_000_000, daysAgo(2), 'hotel'); // before the closing: on the bill
  await tvWithInterest(card.id); // today: after it
  await spend(card.id, 200_000, today, 'dinner');
  await runDailyJob();

  await openMoney('Shopee Card');
  await expect(billBox()).toContainText('Rp1.000.000');
  await expect(billBox()).toContainText('Rp200.000 spent since then goes on the next bill.');
  const bill = await cardBill(card.id);
  expect(bill).toMatchObject({ bill: 1_000_000, lines: { slices: [], interest: [] } });
});

test('paying part of the bill leaves the rest to pay', async () => {
  await billBox().getByRole('button', { name: 'I paid it' }).tap();
  const pay = page.getByRole('dialog', { name: 'Pay Shopee Card' });
  await pay.getByLabel('Paid from').selectOption({ label: 'Main Account' });
  await pay.getByLabel('Amount').fill('400000');
  await pay.getByRole('button', { name: 'Log the payment' }).tap();
  await expect(pay).toBeHidden();
  await expect(billBox()).toContainText('Rp600.000');
  await expect(billBox().getByRole('list', { name: 'Bill lines' })).toContainText(
    'BillRp1.000.000',
  );
  expect((await cardBill(await accountId('Shopee Card'))).left).toBe(600_000);
});
