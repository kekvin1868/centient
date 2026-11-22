// End to end: cards & pay later, slice 4 (planning/features/product/cards-paylater.agent.md, decisions B, G, H, K):
// logging on installments. Written before the slice is built (test first): every test here fails until it is.
// The receipt gets "Pay in" when Paid with is a card / pay later; picking a count shows "Each month"; saving makes
// the expense and the plan as one thing (edit the count → the plan follows, delete → it goes). Over the limit:
// a live line under Paid with, then an OVER THE LIMIT sheet on save with real ways out and no "Save anyway"; a
// plan is checked on its full price. Quick add understands "12x". Skips the first run through the API and resets
// at the end, so the next file starts fresh.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
  await send('post', '/accounts', { name: 'Mandiri', kind: 'BANK', openingBalance: 10_000_000 });
  await send('post', '/accounts', {
    name: 'BCA',
    kind: 'CREDIT_CARD',
    creditLimit: 20_000_000,
    statementDay: 20,
    dueDay: 5,
  });
  await send('post', '/accounts', {
    name: 'Kredivo',
    kind: 'PAYLATER',
    creditLimit: 2_000_000,
    statementDay: 25,
    dueDay: 10,
  });
  await page.goto('/');
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const send = async (method: 'post' | 'delete', path: string, data?: unknown) => {
  const r = await page.request[method](`/api${path}`, { data });
  expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBe(true);
  return r.json();
};
const get = async (path: string) => (await page.request.get(`/api${path}`)).json();
type Account = { id: string; name: string; balance: number; credit_limit: number | null };
const account = async (name: string) =>
  ((await get('/balances')).accounts as Account[]).find(a => a.name === name)!;
type Plan = {
  id: string;
  name: string;
  accountId: string;
  installments: number;
  amountPerInstallment: number;
  price: number;
};
const plans = async () => (await get('/installments')).plans as Plan[];
const plan = async (name: string) =>
  (await plans()).find(p => p.name.toLowerCase() === name.toLowerCase());

const tab = (name: string) => page.getByRole('button', { name, exact: true });
const box = () => page.getByRole('textbox', { name: 'What did you spend or receive?' });
const receipt = () => page.getByRole('dialog', { name: 'New entry' });
const payIn = () => receipt().getByRole('group', { name: 'Pay in' });
const overLimit = () => page.getByRole('dialog', { name: /over the limit/i });

/** Opens a new receipt and fills it in, paid with `paidWith`. */
async function newReceipt(what: string, amount: number, paidWith: string) {
  await tab('Home').tap();
  await page.getByRole('button', { name: 'Add without typing' }).tap();
  await receipt().getByRole('textbox', { name: 'What was it?' }).pressSequentially(what);
  await receipt().getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Shopping' });
  await receipt().getByRole('combobox', { name: 'Paid with' }).selectOption({ label: paidWith });
  await receipt().getByRole('textbox', { name: 'Amount' }).fill(String(amount));
}

// ---- B: Pay in on the receipt ----

test('Pay in shows only when Paid with is a card or pay later', async () => {
  await newReceipt('Sepatu', 500_000, 'Mandiri');
  await expect(payIn()).toHaveCount(0);
  await receipt().getByRole('combobox', { name: 'Paid with' }).selectOption({ label: 'BCA' });
  for (const n of ['Full', '3×', '6×', '12×', '24×'])
    await expect(payIn().getByRole('button', { name: n, exact: true })).toBeVisible();
  await expect(payIn().getByRole('button', { name: 'Full' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(receipt().getByRole('textbox', { name: 'Each month' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('12× on the receipt: Each month is the price ÷ 12; typing more shows the interest', async () => {
  await newReceipt('iPhone', 12_000_000, 'BCA');
  await payIn().getByRole('button', { name: '12×' }).tap();
  const each = receipt().getByRole('textbox', { name: 'Each month' });
  await expect(each).toHaveValue('1.000.000');
  await expect(receipt().getByText(/interest/)).toHaveCount(0); // 0%: nothing to say
  await each.fill('1050000');
  await expect(receipt()).toContainText('incl. Rp50.000 interest'); // per month (owner 2026-11-22)
  await receipt().getByRole('button', { name: 'Log it' }).tap();
  await expect(receipt()).toBeHidden();

  // One save made the expense and the plan: the limit blocks the price, never the interest.
  expect(await plan('iPhone')).toMatchObject({
    installments: 12,
    amountPerInstallment: 1_050_000,
    price: 12_000_000,
  });
  expect((await account('BCA')).balance).toBe(-12_000_000);
  const bca = (await account('BCA')).id;
  const { items } = await get(`/entries?account=${bca}&type=EXPENSE`);
  expect(items).toHaveLength(1);
  // Money shows the plan under the card.
  await tab('Money').tap();
  const hand = page.getByRole('group', { name: 'Accounts' }).getByRole('button', { name: /^BCA/ });
  await hand.focus();
  await hand.press('Enter');
  await expect(page.getByRole('button', { name: /iPhone, 0 of 12 paid/ })).toBeVisible();
});

test('changing the count on the entry: the plan follows', async () => {
  await tab('Home').tap();
  await page
    .locator('.entry-row', { hasText: 'iPhone' })
    .getByRole('button', { name: /^iPhone/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  const pay = edit.getByRole('group', { name: 'Pay in' });
  await expect(pay.getByRole('button', { name: '12×' })).toHaveAttribute('aria-pressed', 'true');
  await expect(edit.getByRole('textbox', { name: 'Each month' })).toHaveValue('1.050.000');
  await pay.getByRole('button', { name: '6×' }).tap();
  // A new count starts again from the price ÷ count (owner 2026-11-22: never guess the bank's new rate).
  await expect(edit.getByRole('textbox', { name: 'Each month' })).toHaveValue('2.000.000');
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toBeHidden();
  expect(await plan('iPhone')).toMatchObject({
    installments: 6,
    amountPerInstallment: 2_000_000,
    price: 12_000_000,
  });
  expect(await plans()).toHaveLength(1); // the same plan, not a second one
});

test('back to Full on the entry: the plan goes, the expense stays', async () => {
  await page
    .locator('.entry-row', { hasText: 'iPhone' })
    .getByRole('button', { name: /^iPhone/ })
    .click();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  await edit.getByRole('group', { name: 'Pay in' }).getByRole('button', { name: 'Full' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toBeHidden();
  expect(await plan('iPhone')).toBeUndefined();
  expect((await account('BCA')).balance).toBe(-12_000_000);
});

test('deleting an entry on installments takes its plan', async () => {
  await newReceipt('Kulkas', 6_000_000, 'BCA');
  await payIn().getByRole('button', { name: '6×' }).tap();
  await receipt().getByRole('button', { name: 'Log it' }).tap();
  await expect(receipt()).toBeHidden();
  const p = (await plan('Kulkas'))!;
  expect(p.installments).toBe(6);
  const bca = (await account('BCA')).id;
  const { items } = await get(`/entries?account=${bca}&merchant=kulkas`);
  await send('delete', `/entries/${items[0].id}`);
  expect(await plan('Kulkas')).toBeUndefined();
  expect((await account('BCA')).balance).toBe(-12_000_000);
});

// ---- G: over the limit ----

test('over the limit: a live line under Paid with, then a sheet with no "Save anyway"', async () => {
  await newReceipt('Tas', 2_500_000, 'Kredivo');
  await expect(receipt()).toContainText('Only Rp2.000.000 left on this card');
  await receipt().getByRole('textbox', { name: 'Amount' }).fill('1500000');
  await expect(receipt().getByText(/left on this card/)).toHaveCount(0);
  await receipt().getByRole('textbox', { name: 'Amount' }).fill('2500000');

  await receipt().getByRole('button', { name: 'Log it' }).tap();
  await expect(overLimit()).toBeVisible();
  await expect(overLimit()).toContainText(/This spend\s*Rp2\.500\.000/);
  await expect(overLimit()).toContainText(/Left on card\s*Rp2\.000\.000/);
  await expect(overLimit()).toContainText(/Short by\s*Rp500\.000/);
  for (const key of ['Pay with another account', 'My limit went up', 'Go back'])
    await expect(overLimit().getByRole('button', { name: new RegExp(key) })).toBeVisible();
  await expect(overLimit().getByRole('button', { name: /anyway/i })).toHaveCount(0);

  // Go back: the receipt is as it was, nothing saved.
  await overLimit().getByRole('button', { name: 'Go back' }).tap();
  await expect(overLimit()).toBeHidden();
  await expect(receipt().getByRole('textbox', { name: 'Amount' })).toHaveValue('2.500.000');
  expect((await account('Kredivo')).balance).toBe(0);
});

test('Pay with another account: ones that cover it first, the rest marked Not enough', async () => {
  await receipt().getByRole('button', { name: 'Log it' }).tap();
  await overLimit()
    .getByRole('button', { name: /Pay with another account/ })
    .tap();
  // Owner 2026-11-22: every account you can pay with (cards by limit left, the rest by balance), the ones that
  // cover the spend first and tappable; the rest listed under them, marked Not enough, not tappable.
  const choices = overLimit().getByRole('button', { name: /left/ });
  await expect(choices.first()).toContainText('BCA'); // 8jt left: covers it
  await expect(overLimit().getByRole('button', { name: /^Mandiri/ })).toContainText('Rp10.000.000');
  const short = overLimit().getByRole('button', { name: /^Dailies/ }); // seeded, Rp0
  await expect(short).toContainText('Not enough');
  await expect(short).toBeDisabled();
  await expect(choices.last()).toContainText('Not enough');
  await overLimit()
    .getByRole('button', { name: /^Mandiri/ })
    .tap();
  await expect(overLimit()).toBeHidden();
  await expect(receipt()).toBeHidden();
  expect((await account('Mandiri')).balance).toBe(10_000_000 - 2_500_000);
  expect((await account('Kredivo')).balance).toBe(0);
});

test('My limit went up: the limit is set in place, the bar refills, and the spend is logged', async () => {
  await newReceipt('Jaket', 2_500_000, 'Kredivo');
  await receipt().getByRole('button', { name: 'Log it' }).tap();
  await overLimit()
    .getByRole('button', { name: /My limit went up/ })
    .tap();
  const limit = overLimit().getByRole('textbox', { name: 'Limit' });
  await expect(limit).toHaveValue('2.000.000');
  await limit.fill('3000000');
  await expect(overLimit()).toContainText(/Left on card\s*Rp3\.000\.000/);
  await overLimit().getByRole('button', { name: 'Save limit & log' }).tap();
  await expect(overLimit()).toBeHidden();
  await expect(receipt()).toBeHidden();
  expect(await account('Kredivo')).toMatchObject({ credit_limit: 3_000_000, balance: -2_500_000 });
});

test('a plan is checked against its full price, not one month', async () => {
  // Kredivo: 500rb left. 1.2jt on 3× is 400rb a month, but the limit blocks all 1.2jt.
  await newReceipt('Helm', 1_200_000, 'Kredivo');
  await payIn().getByRole('button', { name: '3×' }).tap();
  await expect(receipt()).toContainText('Only Rp500.000 left on this card');
  await receipt().getByRole('button', { name: 'Log it' }).tap();
  await expect(overLimit()).toContainText(/Short by\s*Rp700\.000/);
  await overLimit().getByRole('button', { name: 'Go back' }).tap();
  await page.keyboard.press('Escape');
  expect(await plan('Helm')).toBeUndefined();
});

test('offline, the limit is checked against the balances on the phone', async () => {
  await tab('Home').tap(); // balances are cached
  await page.context().setOffline(true);
  try {
    await newReceipt('Topi', 900_000, 'Kredivo');
    await expect(receipt()).toContainText('Only Rp500.000 left on this card');
    await receipt().getByRole('button', { name: 'Log it' }).tap();
    await expect(overLimit()).toBeVisible();
    await overLimit().getByRole('button', { name: 'Go back' }).tap();
    await page.keyboard.press('Escape');
  } finally {
    await page.context().setOffline(false);
  }
});

// ---- H: quick add understands "12x" ----

test('quick add: "hp 12jt bca 12x" logs a 12× plan at 0% interest', async () => {
  await tab('Home').tap();
  await box().fill('hp 12jt bca 12x');
  await expect(page.getByText('12× · Rp1.000.000/mo')).toBeVisible();
  await box().press('Enter');
  await expect(box()).toHaveValue('');
  await expect.poll(async () => (await plan('Hp'))?.installments).toBe(12);
  expect(await plan('Hp')).toMatchObject({ amountPerInstallment: 1_000_000, price: 12_000_000 });
});

test('quick add: "12x" on an account that is not a card asks "Pay later or card?"', async () => {
  await box().fill('kursi 900rb mandiri 3x');
  await expect(page.getByText('Pay later or card?')).toBeVisible();
  await box().press('Enter');
  await expect(page.getByText('Answer the question on the card first')).toBeVisible();
  await page.getByRole('button', { name: 'BCA', exact: true }).tap();
  await expect(page.getByText('3× · Rp300.000/mo')).toBeVisible();
  await box().press('Enter');
  await expect.poll(async () => (await plan('Kursi'))?.accountId).toBe((await account('BCA')).id);
});

test('quick add: a plan with interest asks "Each month?"', async () => {
  // Owner 2026-11-22: an amount after the count, "6x 1.05jt", is the monthly payment; the card asks
  // "Each month?" with it filled in, so a typo is caught before it becomes 6 bills.
  await box().fill('tv 6jt bca 6x 1.05jt');
  await expect(page.getByText('Each month?')).toBeVisible();
  const each = page.getByRole('textbox', { name: 'Each month' });
  await expect(each).toHaveValue('1.050.000');
  await page.getByRole('button', { name: 'OK', exact: true }).tap();
  await expect(page.getByText('6× · Rp1.050.000/mo')).toBeVisible();
  await box().press('Enter');
  await expect.poll(async () => (await plan('Tv'))?.amountPerInstallment).toBe(1_050_000);
  expect((await plan('Tv'))!.price).toBe(6_000_000);
});

test('quick add runs the same limit check', async () => {
  await box().fill('kamera 5jt kredivo');
  await box().press('Enter');
  await expect(overLimit()).toBeVisible();
  await expect(overLimit()).toContainText(/Short by\s*Rp4\.500\.000/);
  await overLimit().getByRole('button', { name: 'Go back' }).tap();
  await expect(box()).toHaveValue('kamera 5jt kredivo');
  await box().fill('');
});
