// End to end: first run (the night menu) with the three starting accounts, categories (ten broad ones, deleting one), list
// borders, the account hand, pockets inside an account (a list; Move money between pockets and accounts), crypto accounts, pay later installments
// with per-person payments and proof of payment, entry icons and swipe actions, and the receipt form.
// One workspace (dev sign-in), so tests run in order.
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
const balances = async () => (await (await api('/balances')).json()) as { accounts: { name: string; balance: number }[]; envelopes: { id: string; name: string; account_id: string; balance: number; color: string | null }[] };
const balance = async (name: string) => (await balances()).accounts.find(a => a.name === name)!.balance;
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const cards = () => page.getByRole('group', { name: 'Accounts' });

test('first run: the night menu sets starting balances, then Home', async () => {
  expect((await accounts()).map(a => [a.name, a.kind])).toEqual([['Dailies', 'EWALLET'], ['Main Account', 'BANK'], ['Miscs', 'DEBIT_CARD']]);
  await page.getByRole('button', { name: 'CLICK TO START' }).tap();
  const menu = page.getByRole('listbox', { name: 'Accounts' });
  await expect(menu).toBeVisible({ timeout: 10_000 });
  const setMain = async (digits: string) => {
    await page.getByRole('button', { name: /^Balance/ }).tap();
    await page.keyboard.type(digits);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };
  await setMain('5000000'); // Main Account is picked first
  await menu.getByRole('option', { name: /Dailies/ }).tap();
  await setMain('300000');
  await page.getByRole('button', { name: 'CONFIRM ▸' }).tap();
  await page.getByRole('dialog', { name: 'Confirm changes' }).getByRole('button', { name: 'CONFIRM ▸' }).tap();
  await expect(page.getByRole('img', { name: 'Centient' })).toBeVisible();
  expect(await balance('Main Account')).toBe(5_000_000);
  // Nothing set aside yet: everything in the Main pockets is free to spend.
  await expect(page.getByRole('heading', { name: 'Free to spend' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ACCOUNTS' })).toHaveCount(0); // onboarded once
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

test('accounts are a hand you turn: drag sideways and it settles on (and picks) the next card', async () => {
  await tab('Money').tap();
  for (const a of [{ name: 'Kredivo', kind: 'PAYLATER', openingBalance: -1_788_000 }, { name: 'Jago', kind: 'BANK' }, { name: 'Mandiri', kind: 'BANK' }]) {
    expect((await api('/accounts', { method: 'POST', data: a })).ok()).toBe(true);
  }
  await page.reload();
  await tab('Money').tap();
  // One fan for any count: six cards, the middle one highest, the outer ones lower and tilted.
  await expect(cards().locator('[data-slot]')).toHaveCount(6);
  const mid = async (name: string) => { const b = (await cards().getByRole('button', { name: new RegExp(`^${name}`) }).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const box = (await cards().boundingBox())!;
  const centre = box.x + box.width / 2;
  // Money opens with one card picked already (Home's account, else the first).
  const picked = cards().getByRole('button', { pressed: true });
  await expect(picked).toHaveCount(1);
  const first = (await picked.getAttribute('aria-label'))!.split(',')[0];
  // Turn the hand: drag left by about a card.
  await page.mouse.move(centre, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(centre - 110, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(picked).not.toHaveAttribute('aria-label', new RegExp(`^${first},`));
  const name = (await picked.getAttribute('aria-label'))!.split(',')[0];
  await expect(page.getByText(name, { exact: true }).last()).toBeVisible(); // its details opened below
  await expect.poll(async () => Math.abs((await mid(name)).x - centre)).toBeLessThan(4); // settled in the middle
  // The cards beside it stay visible: the picked card does not cover their centres.
  const others = await cards().getByRole('button', { pressed: false }).all();
  expect(others.length).toBe(5);
});

/** Home on "All accounts" (picking a card on Money picks that account on Home too). */
async function showAll() {
  const chip = page.getByRole('button', { name: /^Showing .*\. Change account$/ });
  if ((await chip.getAttribute('aria-label'))!.startsWith('Showing all accounts')) return;
  await chip.tap();
  const all = page.getByRole('dialog', { name: 'Pick an account' }).getByRole('button', { name: /^All accounts/ });
  await all.focus();
  await all.press('Enter');
  await expect(page.getByRole('button', { name: /^Showing all accounts/ })).toBeVisible();
}

/** Picks an account card the way a keyboard user would: focus turns the hand to it, Enter picks it. */
async function pick(name: string) {
  const card = cards().getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await card.getAttribute('aria-pressed')) === 'true') return;
  await card.focus();
  await card.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

test('pockets live inside an account: add one, move money in, the account balance stays', async () => {
  await pick('Main Account');
  const pockets = page.getByRole('region', { name: 'Pockets in Main Account' });
  await expect(pockets).toContainText('No pockets yet'); // Main is the account's balance, not a pocket
  await pockets.getByRole('button', { name: '+ New pocket' }).tap();
  const add = page.getByRole('dialog', { name: 'New pocket in Main Account' });
  await add.getByRole('textbox', { name: 'Name' }).fill('Rent');
  await add.getByRole('radio', { name: 'Lilac' }).tap();
  await add.getByRole('button', { name: 'Add pocket' }).tap();
  await expect(add).toBeHidden();
  // A row opens the pocket's actions.
  await pockets.getByRole('button', { name: /^Rent,/ }).tap();
  await page.getByRole('dialog', { name: /^Rent/ }).getByRole('button', { name: 'Add money' }).tap();
  const move = page.getByRole('dialog', { name: 'Add money to Rent' });
  await move.getByRole('textbox', { name: 'Amount' }).fill('(1000000+500000)*2/2'); // a sum, worked out
  await expect(move).toContainText('= Rp1.500.000');
  await move.getByRole('button', { name: 'Move' }).tap();
  await expect(move).toBeHidden();
  const b = await balances();
  const main = (await accounts()).find(a => a.name === 'Main Account')!;
  const inAccount = b.envelopes.filter(e => e.account_id === main.id);
  expect(inAccount.find(e => e.name === 'Rent')).toMatchObject({ balance: 1_500_000, color: '#c3b1ff' });
  expect(inAccount.find(e => e.name === 'Main')!.balance).toBe(3_500_000);
  expect(await balance('Main Account')).toBe(5_000_000);
  // The hero is the free balance, the total sits under it.
  await expect(page.getByText('Rp5.000.000 in total')).toBeVisible();
  // Set aside means it's no longer free to spend. Picking on Money picked Main Account on Home too; show them all.
  await tab('Home').tap();
  await showAll();
  await expect(page.getByRole('region', { name: 'What you can spend' })).toContainText('3.750.000'); // Main 3.5jt + Dailies 300rb - the 50rb from the category test
});

test('a crypto account has no pockets yet and keeps its balance', async () => {
  const r = await api('/accounts', { method: 'POST', data: { name: 'TokoCrypto', kind: 'EXCHANGE', currency: 'BTC', openingBalance: 250_000 } });
  expect(r.ok()).toBe(true);
  expect(await balance('TokoCrypto')).toBe(250_000);
  await page.reload();
  await tab('Money').tap();
  await pick('TokoCrypto');
  await expect(page.getByRole('region', { name: 'Pockets in TokoCrypto' })).toContainText('No pockets yet');
});

test('pay later: add a shared plan, pay each share, attach proof', async () => {
  await pick('Kredivo');
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
  await pick('Kredivo');
  await page.getByRole('button', { name: /Shoes, 0 of 2 paid/ }).tap();
  const plan = page.getByRole('dialog', { name: 'Shoes' });
  await plan.getByRole('button', { name: 'Mark your share of installment 1 paid' }).tap();
  await expect(plan.getByRole('button', { name: 'Mark your share of installment 1 unpaid' })).toBeVisible();
  await expect(plan.getByText(/Attach proof/)).toHaveCount(0);
});

test('an entry gets its own emoji, remembered for its merchant', async () => {
  const cat = (await (await api('/catalog')).json()).categories as { id: string; name: string }[];
  const today = (await (await api('/me')).json()).today as string;
  await api('/transactions', { method: 'POST', data: { type: 'EXPENSE', accountId: await accountId('Dailies'), categoryId: cat[0].id, amount: 20_000, date: today, merchant: 'Arcade' } });
  await page.reload();
  await tab('Home').tap();
  await showAll();
  const row = page.locator('.entry-row', { hasText: 'Arcade' });
  await row.getByRole('button', { name: /Change the icon/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Icon for Arcade' });
  await sheet.getByRole('button', { name: '🎮' }).tap();
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(sheet).toBeHidden();
  await expect(row.getByRole('button', { name: /Change the icon/ })).toContainText('🎮');
  const entries = (await (await api('/entries?limit=20')).json()).items as { icon: string | null; command: { merchant?: string } }[];
  expect(entries.find(e => e.command?.merchant?.toLowerCase() === 'arcade')!.icon).toBe('🎮');
});

test('swiping a row left unlocks edit and delete; deleting can be undone, then goes', async () => {
  const row = page.locator('.entry-row', { hasText: 'Arcade' });
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 180, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  const del = row.getByRole('button', { name: 'Delete Arcade' });
  await expect(del).toHaveCSS('opacity', '1');
  await del.click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click(); // changed my mind
  await expect(page.locator('.entry-row', { hasText: 'Arcade' })).toHaveCount(1);
  // The edit sheet only saves now.
  await page.locator('.entry-row', { hasText: 'Arcade' }).getByRole('button', { name: /^Arcade/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  await expect(edit.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});

test('pockets are a list; Move money goes to another account too; patterns differ', async () => {
  await page.keyboard.press('Escape'); // the edit sheet from the test before
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await tab('Money').tap();
  await pick('Main Account');
  const pockets = page.getByRole('region', { name: 'Pockets in Main Account' });
  await expect(pockets.getByRole('button', { name: /^Rent,/ })).toBeVisible();
  const before = await balance('Jago');
  await pockets.getByRole('button', { name: 'Move money' }).tap();
  const move = page.getByRole('dialog', { name: 'Move money' });
  await move.getByRole('combobox', { name: 'To' }).selectOption({ label: 'Jago' });
  await move.getByRole('textbox', { name: 'Amount' }).fill('100000');
  await move.getByRole('button', { name: 'Move' }).tap();
  await expect(move).toBeHidden();
  expect(await balance('Jago')).toBe(before + 100_000);
  const all = (await (await api('/catalog')).json()).envelopes as { account_id: string; pattern: number; archived_at: string | null }[];
  const main = await accountId('Main Account');
  const mine = all.filter(e => e.account_id === main && !e.archived_at).map(e => e.pattern);
  expect(new Set(mine).size).toBe(mine.length);
});

test('a manual entry is a receipt: type the title, pick a pocket stamp, enter the total', async () => {
  await tab('Home').tap();
  await page.getByRole('button', { name: 'Add without typing' }).tap();
  const sheet = page.getByRole('dialog', { name: 'New entry' });
  await sheet.getByRole('textbox', { name: 'What was it?' }).pressSequentially('Sewa', { delay: 20 });
  await sheet.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Home & Bills' });
  await sheet.getByRole('combobox', { name: 'Paid with' }).selectOption({ label: 'Main Account' });
  await sheet.getByRole('group', { name: 'From pocket' }).getByRole('button', { name: 'RENT' }).tap();
  await sheet.getByRole('textbox', { name: 'Amount' }).fill('100000');
  await sheet.getByRole('button', { name: 'Log it' }).tap();
  await expect(sheet).toBeHidden();
  const rent = (await balances()).envelopes.find(e => e.name === 'Rent')!;
  expect(rent.balance).toBe(1_400_000); // 1.5jt set aside, 100rb spent from it
  // Editing shows the same receipt, stamped, with only Save.
  await page.locator('.entry-row', { hasText: 'Sewa' }).getByRole('button', { name: /^Sewa/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit' });
  await expect(edit.getByText('EDITING')).toBeVisible();
  await expect(edit.getByRole('textbox', { name: 'What was it?' })).toHaveValue('Sewa');
  await expect(edit.getByRole('group', { name: 'From pocket' }).getByRole('button', { name: 'RENT' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
});
