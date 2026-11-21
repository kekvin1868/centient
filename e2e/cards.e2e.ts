// End to end: cards & pay later, slice 1 (planning/features/product/cards-paylater.agent.md). A card or pay later
// needs its limit and both bill days: in the first run (CardSheet; CONFIRM waits for it), in Add account (the button
// names what is missing; the server refuses without them), then Money shows the picked card's own limit bar and no
// limits box, while Home on All accounts keeps the box with both kinds. Starts from a fresh first run and resets at
// the end, so the next file does too.
import { expect, test, type Locator, type Page } from '@playwright/test';

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

type Acc = {
  id: string;
  name: string;
  kind: string;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
};
const account = async (name: string) =>
  ((await (await page.request.get('/api/catalog')).json()).accounts as Acc[]).find(
    a => a.name === name,
  )!;
const balance = async (name: string) =>
  (
    (await (await page.request.get('/api/balances')).json()).accounts as {
      name: string;
      balance: number;
    }[]
  ).find(a => a.name === name)!.balance;
const menu = () => page.getByRole('listbox', { name: 'Accounts' });
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const limits = () => page.getByRole('region', { name: 'Cards and pay later' });
/** E2E_SHOTS=<dir> saves a screenshot at each step worth looking at (for a human check); off by default. */
const shot = async (name: string, part?: Locator) => {
  const path = `${process.env.E2E_SHOTS}/${name}.png`;
  if (process.env.E2E_SHOTS) await (part ?? page).screenshot({ path });
};
/** The picked account's details on Money (name, hero, its limit bar), for a screenshot. */
const picked = (kind: string) => page.locator(`.rarity-${kind}`).last().locator('xpath=../..');

/** Picks an account card on Money the way a keyboard user would: focus turns the hand to it, Enter picks it. */
async function pick(name: string) {
  const card = page
    .getByRole('group', { name: 'Accounts' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await card.getAttribute('aria-pressed')) === 'true') return;
  await card.focus();
  await card.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

test('first run: a card asks its limit and bill days, and CONFIRM waits for them', async () => {
  await page.getByRole('button', { name: 'CLICK TO START' }).tap();
  await expect(page.getByRole('heading', { name: 'ACCOUNTS' })).toBeVisible({ timeout: 10_000 });

  // Main Account keeps 5.000.000; Miscs becomes a credit card with 1.600.000 already used.
  await page.getByRole('button', { name: /^Balance/ }).tap();
  await page.keyboard.type('5j');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await menu().getByRole('option', { name: /Miscs/ }).tap();
  await page.getByRole('button', { name: 'TYPE ▾' }).tap();
  await page
    .getByRole('dialog', { name: 'Type of Miscs' })
    .getByRole('option', { name: /CREDIT CARD/ })
    .tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SET LIMIT + BILL DAYS ▸' })).toBeVisible();
  await shot('1-first-run-card-unset');

  await page.getByRole('button', { name: /^Balance/ }).tap();
  const used = page.getByRole('dialog', { name: 'Balance in Miscs' });
  await expect(used).toContainText('How much is already used on Miscs?');
  await page.keyboard.type('1600k');
  await page.keyboard.press('Enter');
  await expect(used).toBeHidden();

  // CONFIRM before the card is set up: it jumps to the card sheet instead of the summary.
  await page.getByRole('button', { name: 'CONFIRM ▸' }).tap();
  await expect(page.getByText('Miscs NEEDS ITS LIMIT + BILL DAYS')).toBeVisible();
  const sheet = page.getByRole('dialog', { name: 'Limit and bill days of Miscs' });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Confirm changes' })).toHaveCount(0);

  // SET names what is missing, and refuses until all three are there.
  await expect(sheet.getByRole('button', { name: 'SET LIMIT' })).toBeVisible();
  await shot('2-confirm-jumps-to-card-sheet');
  await page.keyboard.type('12j');
  await expect(sheet.locator('.k-amt')).toHaveText('Rp12.000.000');
  await expect(sheet.getByRole('button', { name: 'SET BILL DAYS' })).toBeVisible();
  await sheet.getByRole('button', { name: 'SET BILL DAYS' }).tap();
  await expect(sheet).toBeVisible();
  // From ?? the steppers start on the usual days: closes on the 20th, pay by the 5th.
  await sheet.getByRole('button', { name: 'CLOSES ON later' }).tap();
  await sheet.getByRole('button', { name: 'PAY BY later' }).tap();
  await expect(sheet.locator('.k-day b')).toHaveText(['20', '5']);
  await sheet.getByRole('button', { name: 'CLOSES ON later' }).tap(); // 21
  await sheet.getByRole('button', { name: 'CLOSES ON earlier' }).tap(); // back to 20
  await shot('3-card-sheet-filled');
  await sheet.getByRole('button', { name: 'SET ▸' }).tap();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'LIMIT Rp12.000.000 · CLOSES 20 · PAY BY 5' }),
  ).toBeVisible();

  // The summary shows what is left of the limit and the two days.
  await page.getByRole('button', { name: 'CONFIRM ▸' }).tap();
  const confirm = page.getByRole('dialog', { name: 'Confirm changes' });
  await expect(confirm).toContainText('LEFT Rp10.400.000');
  await expect(confirm).toContainText('CLOSES 20 · PAY BY 5');
  await shot('4-confirm-summary');
  await confirm.getByRole('button', { name: 'CONFIRM ▸' }).tap();
  await expect(page.getByRole('img', { name: 'Centient' })).toBeVisible();

  expect(await account('Miscs')).toMatchObject({
    kind: 'CREDIT_CARD',
    credit_limit: 12_000_000,
    statement_day: 20,
    due_day: 5,
  });
  expect(await balance('Miscs')).toBe(-1_600_000);
});

test('add a pay later: limit and both bill days are required; the server refuses without them', async () => {
  await page.waitForTimeout(2600); // the first run's toast (2.5 s) slides away before this file's screenshots
  const refused = await page.request.post('/api/accounts', {
    data: { name: 'No days', kind: 'PAYLATER', creditLimit: 1_000_000 },
  });
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).toContain('CARD_SETUP');

  await tab('Menu').tap();
  await page.getByRole('option', { name: 'Accounts & pockets', exact: true }).tap();
  await page.getByRole('button', { name: 'Add account' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add account' });
  await sheet.getByRole('textbox', { name: 'Name' }).fill('SPayLater');
  await sheet.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'Pay later' });
  await expect(sheet.getByRole('button', { name: 'Enter the limit' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Limit' }).fill('21000000');
  await expect(sheet.getByRole('button', { name: 'Pick the bill days' })).toBeDisabled();
  await sheet
    .getByRole('combobox', { name: 'Bill closes on day' })
    .selectOption({ label: 'Last day (31)' });
  await sheet.getByRole('combobox', { name: 'Pay by day' }).selectOption({ label: '5' });
  await expect(sheet).toContainText('tanggal cetak');
  await shot('5-add-pay-later');
  await sheet.getByRole('button', { name: 'Add account' }).tap();
  await expect(sheet).toBeHidden();

  expect(await account('SPayLater')).toMatchObject({
    kind: 'PAYLATER',
    credit_limit: 21_000_000,
    statement_day: 31,
    due_day: 5,
  });
  expect(await balance('SPayLater')).toBe(0); // the limit is never saved as debt
});

test('Money: the picked card shows its own limit bar, and no limits box', async () => {
  await tab('Money').tap();
  await pick('SPayLater');
  await expect(page.getByText('left to spend', { exact: true })).toBeVisible();
  await expect(page.getByText('Used Rp0 of Rp21.000.000')).toBeVisible();
  await shot('6-money-pay-later', picked('PAYLATER'));
  await expect(page.getByRole('region', { name: 'Card bill' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set limit and bill days ▸' })).toHaveCount(0);
  await expect(limits()).toHaveCount(0);

  await pick('Miscs');
  await expect(page.getByText('Used Rp1.600.000 of Rp12.000.000')).toBeVisible();
  await shot('7-money-credit-card', picked('CREDIT_CARD'));
  await expect(limits()).toHaveCount(0);
});

test('Home on All accounts keeps the limits box with both kinds', async () => {
  await tab('Home').tap();
  const chip = page.getByRole('button', { name: /^Showing .*\. Change account$/ });
  if (!(await chip.getAttribute('aria-label'))!.startsWith('Showing all accounts')) {
    await chip.tap();
    const all = page
      .getByRole('dialog', { name: 'Pick an account' })
      .getByRole('button', { name: /^All accounts/ });
    await all.focus();
    await all.press('Enter');
  }
  await expect(page.getByRole('button', { name: /^Showing all accounts/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Pick an account' })).toBeHidden();
  await expect(limits()).toBeVisible();
  await expect(limits()).toContainText('Credit card');
  await expect(limits()).toContainText('Pay later');
  await expect(limits()).toContainText('Rp10.400.000');
  await expect(limits()).toContainText('Rp21.000.000');
  await expect(limits()).not.toContainText('Not in total');
  await limits().scrollIntoViewIfNeeded();
  await shot('8-home-all-accounts');
});
