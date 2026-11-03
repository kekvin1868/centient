// End to end: a goal's Activity sheet (step 6). The goal's actions offer Activity; the sheet shows progress, what to put
// in each cycle and by when, and every movement with the balance after it; adding money shows up on reopening; a goal
// with no date has no per-cycle line. Skips the first run through the API and resets at the end, so the next file
// starts from a fresh workspace. The server's clock is real, so dates are relative to today.
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.request.patch('/api/workspace', { data: { onboarded: true, cycle_start_day: 1 } });
});
test.afterAll(async () => {
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const post = async (path: string, data: unknown) => {
  const r = await page.request.post(`/api${path}`, { data });
  expect(r.ok()).toBe(true);
  return r.json();
};
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const [y, m] = today.split('-').map(Number);
const firstOf = (back: number) => new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
// The last day of the month four ahead: this cycle and four more are left.
const targetDate = new Date(Date.UTC(y, m + 4, 0)).toISOString().slice(0, 10);
const tab = (name: string) => page.getByRole('button', { name, exact: true });
const pockets = () => page.getByRole('region', { name: 'Pockets in Main Account' });

/** Lifts an account's card on Money so its pockets show. */
async function pick(name: string) {
  const card = page
    .getByRole('group', { name: 'Accounts' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await card.getAttribute('aria-pressed')) === 'true') return;
  await card.focus();
  await card.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

/** Opens a pocket's actions from its card on Money, then one of them (by keyboard: closing sheets hand focus back). */
async function action(pocket: string, name: string) {
  await pockets()
    .getByRole('button', { name: new RegExp(`^${pocket},`) })
    .focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('dialog', { name: new RegExp(`^${pocket} ·`) })
    .getByRole('button', { name })
    .focus();
  await page.keyboard.press('Enter');
}

test('T6.19 Activity on a goal: progress, the per-cycle line and four movements', async () => {
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: { id: string; name: string; default_envelope_id: string }[];
  };
  const main = cat.accounts.find(a => a.name === 'Main Account')!;
  await post(`/accounts/${main.id}/balance`, { actual: 20_000_000 });
  const goal = await post('/envelopes', {
    accountId: main.id,
    name: 'Holiday',
    kind: 'GOAL',
    targetAmount: 10_000_000,
    targetDate,
  });
  const move = (from: string, to: string, amount: number, date: string) => ({
    type: 'ALLOCATE',
    fromEnvelopeId: from,
    toEnvelopeId: to,
    amount,
    date,
  });
  const pot = main.default_envelope_id;
  await post('/transactions', {
    commands: [
      move(pot, goal.id, 500_000, firstOf(2)),
      move(goal.id, pot, 500_000, firstOf(1)),
      move(pot, goal.id, 2_000_000, firstOf(0) < today ? firstOf(0) : today),
      move(pot, goal.id, 1_000_000, today),
    ],
  });
  await page.goto('/');
  await tab('Money').tap();
  await pick('Main Account');
  await action('Holiday', 'Activity');
  const sheet = page.getByRole('dialog', { name: 'Holiday · Activity' });
  const outlook = sheet.getByTestId('goal-outlook');
  await expect(outlook).toContainText('30%');
  await expect(outlook).toContainText('Rp3.000.000 of Rp10.000.000');
  await expect(outlook).toContainText('Rp1.400.000 a cycle');
  await expect(outlook).toContainText('(5 cycles left)');
  await expect(sheet.locator('li.entry-row')).toHaveCount(4);
  await expect(sheet.locator('li.entry-row').first()).toContainText('+Rp1.000.000');
  await expect(sheet.locator('li.entry-row').first()).toContainText('Rp3.000.000');
  await sheet.press('Escape');
  await expect(sheet).toBeHidden();
});

test('T6.20 money added shows as a new top line when Activity opens again', async () => {
  await action('Holiday', 'Add money');
  const move = page.getByRole('dialog', { name: 'Add money to Holiday' });
  await move.getByRole('textbox', { name: 'Amount' }).fill('500000');
  await move.getByRole('button', { name: 'Move' }).tap();
  await expect(move).toBeHidden();
  await action('Holiday', 'Activity');
  const sheet = page.getByRole('dialog', { name: 'Holiday · Activity' });
  await expect(sheet.getByTestId('goal-outlook')).toContainText('35%');
  await expect(sheet.locator('li.entry-row')).toHaveCount(5);
  await expect(sheet.locator('li.entry-row').first()).toContainText('+Rp500.000');
  await expect(sheet.locator('li.entry-row').first()).toContainText('Rp3.500.000');
  await sheet.press('Escape');
  await expect(sheet).toBeHidden();
});

test('T6.21 a goal with no date has no per-cycle line; its list still shows', async () => {
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: { id: string; name: string; default_envelope_id: string }[];
  };
  const main = cat.accounts.find(a => a.name === 'Main Account')!;
  const laptop = await post('/envelopes', {
    accountId: main.id,
    name: 'Laptop',
    kind: 'GOAL',
    targetAmount: 5_000_000,
  });
  await post('/transactions', {
    type: 'ALLOCATE',
    fromEnvelopeId: main.default_envelope_id,
    toEnvelopeId: laptop.id,
    amount: 1_000_000,
    date: today,
  });
  await page.reload();
  await tab('Money').tap();
  await pick('Main Account');
  await action('Laptop', 'Activity');
  const sheet = page.getByRole('dialog', { name: 'Laptop · Activity' });
  await expect(sheet.getByTestId('goal-outlook')).toContainText('20%');
  await expect(sheet.getByTestId('goal-outlook')).not.toContainText('a cycle');
  await expect(sheet.locator('li.entry-row')).toHaveCount(1);
});

test('a pocket that is not a goal has no Activity', async () => {
  await page.keyboard.press('Escape');
  const cat = (await (await page.request.get('/api/catalog')).json()) as {
    accounts: { id: string; name: string }[];
  };
  await post('/envelopes', {
    accountId: cat.accounts.find(a => a.name === 'Main Account')!.id,
    name: 'Rent',
    kind: 'SPENDING',
  });
  await page.reload();
  await tab('Money').tap();
  await pick('Main Account');
  await pockets()
    .getByRole('button', { name: /^Rent,/ })
    .focus();
  await page.keyboard.press('Enter');
  const actions = page.getByRole('dialog', { name: /^Rent ·/ });
  await expect(actions.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Activity' })).toHaveCount(0);
});
