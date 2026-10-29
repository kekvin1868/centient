// End to end: the first run. Title screen, date card, then the night menu: rename, change a type, set a
// balance with the keypad, add a pocket with its own amount, drop an account, undo, confirm. Checks what reached the
// server, then resets the workspace so the next spec starts from a fresh first run.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/');
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

type Acc = { id: string; name: string; kind: string };
const catalog = async () => (await (await page.request.get('/api/catalog')).json()) as { accounts: (Acc & { archived_at: string | null })[] };
const balances = async () => (await (await page.request.get('/api/balances')).json()) as { accounts: { name: string; balance: number }[]; envelopes: { name: string; balance: number }[] };
const menu = () => page.getByRole('listbox', { name: 'Accounts' });

test('title, date card, then straight into the menu', async () => {
  await page.getByRole('button', { name: 'CLICK TO START' }).tap();
  // Under reduced motion (the e2e setting) the date card types out at once and passes in a blink.
  await expect(page.getByRole('heading', { name: 'ACCOUNTS' })).toBeVisible({ timeout: 10_000 });
});

test('rename, retype, set balances, add a pocket, drop and undo', async () => {
  await expect(menu().getByRole('option')).toHaveText([/Main Account/, /Dailies/, /Miscs/, /ADD ACCOUNT/]);
  // Tap the picked row again to rename it.
  await menu().getByRole('option', { name: /Main Account/ }).tap();
  await page.getByRole('textbox', { name: 'Account name' }).fill('BCA');
  await page.keyboard.press('Enter');
  await expect(menu().getByRole('option').first()).toContainText('BCA');

  await page.getByRole('button', { name: 'TYPE ▾' }).tap();
  await page.getByRole('dialog', { name: 'Type of BCA' }).getByRole('option', { name: /DEBIT CARD/ }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /^Balance/ }).tap();
  const pad = page.getByRole('dialog', { name: 'Balance in BCA' });
  for (const k of ['5', '000', '000']) await pad.getByRole('button', { name: k, exact: true }).tap();
  await expect(pad.locator('.k-amt')).toHaveText('Rp5.000.000');
  await pad.getByRole('button', { name: 'SET ▸' }).tap();
  await expect(pad).toBeHidden();

  // The title bar's close button leaves it as it was.
  await page.getByRole('button', { name: /^Balance/ }).tap();
  await pad.getByRole('button', { name: 'Close' }).tap();
  await expect(pad).toBeHidden();

  await page.getByRole('button', { name: '+ POCKET' }).tap();
  const pocket = page.getByRole('dialog', { name: /Pocket 1 in BCA/ });
  await pocket.getByRole('textbox', { name: 'Pocket name' }).fill('Rent');
  await page.keyboard.press('Enter');
  await page.keyboard.type('2j'); // J adds 000000: Rp2.000.000
  await page.keyboard.press('Enter');
  await expect(pocket).toBeHidden();
  await expect(menu().getByRole('option').first()).toContainText('Rp7.000.000');

  // MOVE BALANCES (title bar of the balance) takes some to another account; a typed sum is worked out; undo puts it back.
  await page.getByRole('button', { name: /^Balance/ }).tap();
  await pad.getByRole('button', { name: 'MOVE BALANCES' }).tap();
  const mv = page.getByRole('dialog', { name: 'Move balances from BCA' });
  await expect(mv.getByRole('radio', { name: /Dailies/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown'); // the arrows pick the target
  await expect(mv.getByRole('radio', { name: /Dailies/ })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('ArrowUp');
  await expect(mv.getByRole('radio', { name: /Dailies/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.type('6j'); // more than the Rp5.000.000 balance: refused
  await mv.getByRole('button', { name: 'MOVE ▸' }).tap();
  await expect(mv).toBeVisible();
  await page.keyboard.press('Delete');
  await page.keyboard.type('500000*2+(');
  await expect(mv.locator('.k-amt')).toHaveText('Rp1.000.000'); // half-typed: what it comes to so far
  await expect(mv.locator('.k-sum')).toHaveClass(/bad/);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(mv.locator('.k-amt')).toHaveText('Rp1.000.000');
  await expect(mv.locator('.k-sum')).not.toHaveClass(/bad/);
  await page.keyboard.press('Enter');
  await expect(mv).toBeHidden();
  await expect(menu().getByRole('option').first()).toContainText('Rp6.000.000');
  await expect(menu().getByRole('option', { name: /Dailies/ })).toContainText('Rp1.000.000');
  await page.getByRole('button', { name: 'UNDO' }).tap();
  await expect(menu().getByRole('option').first()).toContainText('Rp7.000.000');

  await menu().getByRole('option', { name: /Miscs/ }).tap();
  await page.getByRole('button', { name: 'DROP' }).tap();
  await expect(menu().getByRole('option', { name: /Miscs/ })).toContainText('DROPPED');
  await page.getByRole('button', { name: 'UNDO' }).tap();
  await expect(menu().getByRole('option', { name: /Miscs/ })).not.toContainText('DROPPED');
  await page.getByRole('button', { name: 'DROP' }).tap();
});

test('the guide has two tabs and closes on a tap outside', async () => {
  await page.getByRole('button', { name: 'Guide and controls' }).tap();
  const guide = page.getByRole('dialog', { name: 'Guide and controls' });
  await expect(guide.getByRole('tabpanel', { name: 'GUIDE' })).toContainText('START HERE');
  await guide.getByRole('tab', { name: 'CONTROLS' }).tap();
  await expect(guide.getByRole('tabpanel', { name: 'CONTROLS' })).toContainText('KEYPAD');
  await page.mouse.click(5, 5);
  await expect(guide).toBeHidden();
});

test('confirm saves names, types, balances and pockets, then Home', async () => {
  await page.getByRole('button', { name: 'CONFIRM ▸' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Confirm changes' });
  await expect(sheet).toContainText('WAS Main Account');
  await sheet.getByRole('button', { name: 'CONFIRM ▸' }).tap();
  await expect(page.getByRole('img', { name: 'Centient' })).toBeVisible();

  const live = (await catalog()).accounts.filter(a => !a.archived_at).map(a => [a.name, a.kind]);
  expect(live).toEqual(expect.arrayContaining([['BCA', 'DEBIT_CARD'], ['Dailies', 'EWALLET']]));
  expect(live.map(a => a[0])).not.toContain('Miscs');
  const b = await balances();
  expect(b.accounts.find(a => a.name === 'BCA')!.balance).toBe(7_000_000);
  expect(b.envelopes.find(e => e.name === 'Rent')!.balance).toBe(2_000_000);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'ACCOUNTS' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'CLICK TO START' })).toHaveCount(0);
});
