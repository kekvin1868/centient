// End to end: first run with the three starting accounts, categories (ten broad ones, deleting one), list
// borders, account cards layout, pockets inside an account, crypto accounts, and pay later installments with
// per-person payments and proof of payment. One workspace (dev sign-in), so tests run in order.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/');
});
test.afterAll(async () => page.close());

const api = (path: string, init?: { method?: string; data?: unknown }) =>
  page.request.fetch(`/api${path}`, { method: init?.method ?? 'GET', data: init?.data });
type Acc = { id: string; name: string; kind: string; default_envelope_id: string };
const accounts = async () => (await (await api('/catalog')).json()).accounts as Acc[];
const accountId = async (name: string) => (await accounts()).find(a => a.name === name)!.id;
const balances = async () => (await (await api('/balances')).json()) as { accounts: { name: string; balance: number }[]; envelopes: { id: string; name: string; account_id: string; balance: number }[] };
const balance = async (name: string) => (await balances()).accounts.find(a => a.name === name)!.balance;
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const cards = () => page.getByRole('group', { name: 'Accounts' });

test('first run: three everyday accounts to name and fill, then Home', async () => {
  expect((await accounts()).map(a => [a.name, a.kind])).toEqual([['Dailies', 'EWALLET'], ['Main Account', 'BANK'], ['Miscs', 'DEBIT_CARD']]);
  await expect(page.getByRole('heading', { name: 'Welcome to Centient' })).toBeVisible();
  await page.getByRole('textbox', { name: 'In Main Account now' }).fill('5000000');
  await page.getByRole('textbox', { name: 'In Dailies now' }).fill('300000');
  await page.getByRole('button', { name: 'Start' }).tap();
  await expect(page.getByRole('img', { name: 'Centient' })).toBeVisible();
  expect(await balance('Main Account')).toBe(5_000_000);
  // Nothing set aside yet: everything in the Main pockets is free to spend.
  await expect(page.getByRole('heading', { name: 'Free to spend' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Centient' })).toHaveCount(0); // onboarded once
});

test('only the ten broad spending categories are offered', async () => {
  await page.getByRole('button', { name: 'Add without typing' }).tap();
  const sheet = page.getByRole('dialog', { name: 'New entry' });
  const options = await sheet.getByRole('combobox', { name: 'Category' }).locator('option').allTextContents();
  expect(options.slice(1)).toEqual(['Education', 'Family & Giving', 'Fees', 'Food & Drink', 'Fun', 'Health', 'Home & Bills', 'Other', 'Shopping', 'Transport']);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('deleting a category moves its entries to another one', async () => {
  const fun = ((await (await api('/catalog')).json()).categories as { id: string; name: string }[]).find(c => c.name === 'Fun')!.id;
  expect((await api('/transactions', { method: 'POST', data: { type: 'EXPENSE', accountId: await accountId('Dailies'), categoryId: fun, amount: 50_000, date: '2026-10-20', merchant: 'Timezone' } })).ok()).toBe(true);
  await tab('Settings').tap();
  await page.getByRole('button', { name: /Fun/ }).first().tap();
  await page.getByRole('dialog', { name: 'Fun' }).getByRole('button', { name: 'Delete category' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Delete Fun' });
  await expect(sheet.getByRole('combobox', { name: 'Move its entries to' })).toHaveValue(/.+/);
  await sheet.getByRole('combobox', { name: 'Move its entries to' }).selectOption({ label: 'Other' });
  await sheet.getByRole('button', { name: 'Delete category' }).tap();
  await expect(page.getByText('Deleted Fun')).toBeVisible();
  const cats = ((await (await api('/catalog')).json()).categories as { name: string }[]).map(c => c.name);
  expect(cats).not.toContain('Fun');
  const entries = (await (await api('/entries?limit=10')).json()).items as { command: { merchant?: string; categoryId: string } }[];
  const other = ((await (await api('/catalog')).json()).categories as { id: string; name: string }[]).find(c => c.name === 'Other')!.id;
  expect(entries.find(e => e.command?.merchant?.toLowerCase() === 'timezone')!.command.categoryId).toBe(other);
});

test('lists have one even hairline on the rounded card', async () => {
  const list = page.locator('.k-list[class*="rounded"]').first();
  await expect(list).toHaveCSS('border-top-width', '1px');
  await expect(list).toHaveCSS('border-bottom-width', '1px');
  await expect(list.locator('> ul')).toHaveCSS('border-top-width', '0px');
});

test('up to four accounts sit in a straight tray; five or more scroll in a row', async () => {
  await tab('Money').tap();
  await expect(cards()).toHaveAttribute('data-layout', 'tray'); // the three starting accounts
  for (const a of [{ name: 'Kredivo', kind: 'PAYLATER', openingBalance: -1_788_000 }, { name: 'Jago', kind: 'BANK' }]) {
    expect((await api('/accounts', { method: 'POST', data: a })).ok()).toBe(true);
  }
  await page.reload();
  await tab('Money').tap();
  await expect(cards()).toHaveAttribute('data-layout', 'scroll');
  // Straight: every card's slot sits on the same line (no arch). Slots, not cards: cards float and deal in.
  const slots = cards().locator('.snap-start');
  await expect(slots).toHaveCount(5);
  const tops = await slots.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test('pockets live inside an account: add one, move money in, the account balance stays', async () => {
  await cards().getByRole('button', { name: /^Main Account/ }).tap({ force: true });
  const pockets = page.getByRole('region', { name: 'Pockets in Main Account' });
  await expect(pockets.getByRole('button', { name: /^Main,/ })).toBeVisible();
  await pockets.getByRole('button', { name: '+ Add pocket' }).tap();
  const add = page.getByRole('dialog', { name: 'New pocket in Main Account' });
  await add.getByRole('textbox', { name: 'Name' }).fill('Rent');
  await add.getByRole('button', { name: 'Add pocket' }).tap();
  await expect(add).toBeHidden();
  await pockets.getByRole('button', { name: /^Rent,/ }).tap({ position: { x: 120, y: 30 } });
  await pockets.getByRole('button', { name: 'Add from Main' }).tap();
  const move = page.getByRole('dialog', { name: 'Add money to Rent' });
  await move.getByRole('textbox', { name: 'Amount' }).fill('1500000');
  await move.getByRole('button', { name: 'Move' }).tap();
  await expect(move).toBeHidden();
  const b = await balances();
  const main = (await accounts()).find(a => a.name === 'Main Account')!;
  const inAccount = b.envelopes.filter(e => e.account_id === main.id);
  expect(inAccount.find(e => e.name === 'Rent')!.balance).toBe(1_500_000);
  expect(inAccount.find(e => e.name === 'Main')!.balance).toBe(3_500_000);
  expect(await balance('Main Account')).toBe(5_000_000);
  // Set aside means it's no longer free to spend.
  await tab('Home').tap();
  await expect(page.getByRole('region', { name: 'What you can spend' })).toContainText('3.750.000'); // Main 3.5jt + Dailies 300rb - the 50rb from the category test
});

test('a crypto account has its own Main pocket and keeps its balance', async () => {
  const r = await api('/accounts', { method: 'POST', data: { name: 'TokoCrypto', kind: 'EXCHANGE', currency: 'BTC', openingBalance: 250_000 } });
  expect(r.ok()).toBe(true);
  expect(await balance('TokoCrypto')).toBe(250_000);
  await page.reload();
  await tab('Money').tap();
  await cards().getByRole('button', { name: /^TokoCrypto/ }).tap({ force: true });
  await expect(page.getByRole('region', { name: 'Pockets in TokoCrypto' }).getByRole('button', { name: /^Main,.*BTC 0.0025/ })).toBeVisible();
});

test('pay later: add a shared plan, pay each share, attach proof', async () => {
  await cards().getByRole('button', { name: /^Kredivo/ }).tap({ force: true });
  await page.getByRole('button', { name: 'Add installments' }).tap();
  const form = page.getByRole('dialog', { name: 'Add installments' });
  await form.getByRole('textbox', { name: 'What' }).fill('iPhone');
  await form.getByRole('textbox', { name: 'Each installment' }).fill('894000');
  await form.locator('li', { hasText: 'Already paid' }).getByRole('button').last().tap(); // 1 already paid
  await form.getByRole('button', { name: '+ Add a person' }).tap();
  await form.getByRole('textbox', { name: 'Person 1' }).fill('Brother');
  await expect(form.getByText('2 people · Rp447.000 each')).toBeVisible();
  await form.getByRole('button', { name: 'Add installments' }).tap();
  await expect(form).toBeHidden();

  // Brother's remaining half (2 x 447k) is now owed to me.
  expect(await balance('Brother')).toBe(894_000);
  await page.getByRole('button', { name: /iPhone, 1 of 3 paid/ }).tap();
  const plan = page.getByRole('dialog', { name: 'iPhone' });
  await plan.getByRole('combobox', { name: 'You pay from' }).selectOption({ label: 'Main Account' });
  await plan.getByRole('button', { name: 'Mark your share of installment 2 paid' }).tap();
  await expect(plan.getByRole('button', { name: 'Mark your share of installment 2 unpaid' })).toBeVisible();
  expect(await balance('Main Account')).toBe(5_000_000 - 447_000);
  expect(await balance('Kredivo')).toBe(-1_788_000 + 447_000);

  await plan.getByRole('button', { name: "Mark Brother's share of installment 2 paid" }).tap();
  await expect(plan.getByRole('button', { name: "Mark Brother's share of installment 2 unpaid" })).toBeVisible();
  expect(await balance('Brother')).toBe(447_000);
  expect(await balance('Kredivo')).toBe(-894_000);

  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  await plan.getByLabel('Attach proof for Brother, installment 2').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
  const link = plan.getByRole('link', { name: 'proof.png' });
  await expect(link).toBeVisible();
  const file = await api((await link.getAttribute('href'))!.replace('/api', ''));
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('image/png');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /iPhone, 2 of 3 paid/ })).toBeVisible();
});

test('a plan only you pay has no proof of payment', async () => {
  const r = await api('/installments', { method: 'POST', data: {
    accountId: await accountId('Kredivo'), name: 'Shoes', amountPerInstallment: 200_000, installments: 2, firstDue: '2026-12-01',
    paidCount: 0, myShare: 200_000, others: [], alreadyInBalance: true,
  } });
  expect(r.status()).toBe(201);
  await page.reload();
  await tab('Money').tap();
  await cards().getByRole('button', { name: /^Kredivo/ }).tap({ force: true });
  await page.getByRole('button', { name: /Shoes, 0 of 2 paid/ }).tap();
  const plan = page.getByRole('dialog', { name: 'Shoes' });
  await plan.getByRole('button', { name: 'Mark your share of installment 1 paid' }).tap();
  await expect(plan.getByRole('button', { name: 'Mark your share of installment 1 unpaid' })).toBeVisible();
  await expect(plan.getByText(/Attach proof/)).toHaveCount(0);
});
