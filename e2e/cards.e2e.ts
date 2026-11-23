// End to end: cards & pay later, slice 1 (planning/features/product/cards-paylater.agent.md). A card or pay later
// needs its limit and both bill days: in the first run (CardSheet; CONFIRM waits for it), in Add account (the button
// names what is missing; the server refuses without them), then Money shows the picked card's own limit bar and no
// limits box, while Home on All accounts keeps the box with both kinds.
// Each test starts from a fresh workspace and makes what it needs through the API, so any test runs alone and one
// failure stays one failure. The file resets at the end, so the next file starts from a fresh first run too.
import { expect, notToday, sql, test, type CardSeed } from './cardsApp';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/workspace/reset');
});
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.request.post('/api/workspace/reset');
  await page.close();
});

const visa: CardSeed = {
  kind: 'CREDIT_CARD',
  limit: 12_000_000,
  closes: 20,
  due: 5,
  billed: 1_000_000,
  since: 600_000,
};
const payLater: CardSeed = { kind: 'PAYLATER', limit: 21_000_000, closes: 31, due: 5 };

test('first run: a card asks its limit and bill days, and CONFIRM waits for them', async ({
  page,
  app,
}) => {
  const closes = notToday(20);
  await page.goto('/');
  await page.getByRole('button', { name: 'CLICK TO START' }).tap();
  await expect(page.getByRole('heading', { name: 'ACCOUNTS' })).toBeVisible({ timeout: 10_000 });
  const menu = page.getByRole('listbox', { name: 'Accounts' });
  const pocket = page.getByRole('button', { name: /^Pocket 1/ });

  await test.step('Main Account keeps 5.000.000', async () => {
    await page.getByRole('button', { name: /^Balance/ }).tap();
    await page.keyboard.type('5j');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  await test.step('Miscs becomes a credit card: its pocket goes, undo brings both back', async () => {
    await menu.getByRole('option', { name: /Miscs/ }).tap();
    await page.getByRole('button', { name: '+ POCKET' }).tap();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(pocket).toBeVisible();
    const toCard = async () => {
      await page.getByRole('button', { name: 'TYPE ▾' }).tap();
      await page
        .getByRole('dialog', { name: 'Type of Miscs' })
        .getByRole('option', { name: /CREDIT CARD/ })
        .tap();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    };
    await toCard();
    await expect(pocket).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(pocket).toBeVisible();
    await expect(page.getByRole('button', { name: 'SET LIMIT + BILL DAYS ▸' })).toHaveCount(0);
    await toCard();
    await expect(pocket).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'SET LIMIT + BILL DAYS ▸' })).toBeVisible();
    // A card has no pockets: its hero is what is USED of the limit.
    await expect(page.getByRole('button', { name: 'Used, not set' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ POCKET' })).toHaveCount(0);
    await expect(page.getByText('A card has no pockets')).toBeVisible();
    await app.shot('1-first-run-card-unset');
  });

  const sheet = page.getByRole('dialog', { name: 'Limit and bill days of Miscs' });
  await test.step('CONFIRM before the card is set up jumps to the card sheet', async () => {
    await page.getByRole('button', { name: 'CONFIRM ▸' }).tap();
    await expect(page.getByText('Miscs NEEDS ITS LIMIT + BILL DAYS')).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Confirm changes' })).toHaveCount(0);
  });

  await test.step('SET names what is missing, and refuses until all three are there', async () => {
    const day = (label: string, value: string) =>
      sheet.getByRole('group', { name: label, exact: true }).getByText(value, { exact: true });
    await expect(sheet.getByRole('button', { name: 'SET LIMIT' })).toBeVisible();
    await app.shot('2-confirm-jumps-to-card-sheet');
    await page.keyboard.type('12j');
    await expect(sheet.getByText('Rp12.000.000', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'SET BILL DAYS' })).toBeVisible();
    await sheet.getByRole('button', { name: 'SET BILL DAYS' }).tap();
    await expect(sheet).toBeVisible();
    // From ?? the steppers start on the usual days: closes on the 20th, pay by the 5th.
    await sheet.getByRole('button', { name: 'CLOSES ON later' }).tap();
    await sheet.getByRole('button', { name: 'PAY BY later' }).tap();
    await expect(day('CLOSES ON', '20')).toBeVisible();
    await expect(day('PAY BY', '5')).toBeVisible();
    await sheet.getByRole('button', { name: 'CLOSES ON later' }).tap();
    await expect(day('CLOSES ON', '21')).toBeVisible();
    await sheet.getByRole('button', { name: 'CLOSES ON earlier' }).tap();
    await expect(day('CLOSES ON', '20')).toBeVisible();
    if (closes !== 20) await sheet.getByRole('button', { name: 'CLOSES ON later' }).tap();
    await expect(day('CLOSES ON', String(closes))).toBeVisible();
    // What is used, in two parts: still unpaid on the last bill, and spent since.
    await sheet.getByRole('tab', { name: 'LAST BILL' }).tap();
    await expect(sheet).toContainText("Still unpaid on Miscs's last bill?");
    await page.keyboard.type('1j');
    await sheet.getByRole('tab', { name: 'SINCE' }).tap();
    await page.keyboard.type('600k');
    await expect(sheet).toContainText('USED Rp1.600.000 OF Rp12.000.000');
    await app.shot('3-card-sheet-filled');
    await sheet.getByRole('button', { name: 'SET ▸' }).tap();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole('button', { name: `LIMIT Rp12.000.000 · CLOSES ${closes} · PAY BY 5` }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Used, Rp1.600.000' })).toBeVisible();
  });

  await test.step('the summary shows what is left of the limit and the two days', async () => {
    await page.getByRole('button', { name: 'CONFIRM ▸' }).tap();
    const confirm = page.getByRole('dialog', { name: 'Confirm changes' });
    await expect(confirm).toContainText('LEFT Rp10.400.000');
    await expect(confirm).toContainText(`CLOSES ${closes} · PAY BY 5`);
    await app.shot('4-confirm-summary');
    await confirm.getByRole('button', { name: 'CONFIRM ▸' }).tap();
    await expect(page.getByRole('img', { name: 'Centient' })).toBeVisible();
  });

  await test.step('saved: the unpaid part on the last bill, what was spent since on the next', async () => {
    const miscs = await app.account('Miscs');
    expect(miscs).toMatchObject({
      kind: 'CREDIT_CARD',
      credit_limit: 12_000_000,
      statement_day: closes,
      due_day: 5,
    });
    expect(await app.balance('Miscs')).toBe(-1_600_000);
    expect(await app.bill(miscs.id)).toMatchObject({ bill: 1_000_000, spentSince: 600_000 });
  });
});

test('add a pay later: limit and both bill days are required; the server refuses without them', async ({
  page,
  app,
}) => {
  await app.onboard();
  const refused = await page.request.post('/api/accounts', {
    data: { name: 'No days', kind: 'PAYLATER', creditLimit: 1_000_000 },
  });
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).toContain('CARD_SETUP');

  await page.goto('/');
  await app.openAccounts();
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
  // Used (last bill + since) can't be more than the limit.
  await sheet.getByRole('textbox', { name: 'Unpaid on the last bill' }).fill('22000000');
  await expect(sheet.getByRole('button', { name: 'More used than the limit' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Unpaid on the last bill' }).fill('');
  await expect(sheet).toContainText('tanggal cetak');
  await app.shot('5-add-pay-later');
  await sheet.getByRole('button', { name: 'Add account' }).tap();
  await expect(sheet).toBeHidden();

  expect(await app.account('SPayLater')).toMatchObject({
    kind: 'PAYLATER',
    credit_limit: 21_000_000,
    statement_day: 31,
    due_day: 5,
  });
  expect(await app.balance('SPayLater')).toBe(0); // the limit is never saved as debt
});

test('Money: the picked card shows its own limit bar, and no limits box', async ({ page, app }) => {
  await app.onboard();
  await app.addCard('SPayLater', payLater);
  await app.addCard('Visa', { ...visa, closes: notToday(20) });
  await page.goto('/');
  await app.tab('Money').tap();

  await app.pick('SPayLater');
  await expect(page.getByText('left to spend', { exact: true })).toBeVisible();
  await expect(page.getByText('Used Rp0 of Rp21.000.000')).toBeVisible();
  await app.shot('6-money-pay-later', app.picked('PAYLATER'));
  await expect(page.getByRole('region', { name: 'Card bill' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set limit and bill days ▸' })).toHaveCount(0);
  await expect(app.limits()).toHaveCount(0);

  await app.pick('Visa');
  await expect(page.getByText('Used Rp1.600.000 of Rp12.000.000')).toBeVisible();
  await expect(page.getByRole('region', { name: /^Pockets in/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move money/ })).toHaveCount(0);
  await app.shot('7-money-credit-card', app.picked('CREDIT_CARD'));

  // Update balance on a card asks what is used now; more used is logged as spending.
  await page.getByRole('button', { name: 'Update balance' }).tap();
  const upd = page.getByRole('dialog', { name: 'Visa' });
  await expect(upd).toContainText('Centient shows as used');
  await expect(upd).toContainText('Rp1.600.000');
  await upd.getByRole('textbox', { name: 'How much is used now?' }).fill('1700000');
  await expect(upd).toContainText('Rp100.000 more used than Centient had.');
  await app.shot('7b-update-card-balance');
  await upd.getByRole('button', { name: 'Skip and update' }).tap();
  await expect(upd).toBeHidden();
  expect(await app.balance('Visa')).toBe(-1_700_000);
  await expect(page.getByText('Used Rp1.700.000 of Rp12.000.000')).toBeVisible();
  await expect(app.limits()).toHaveCount(0);
});

test('Home on All accounts keeps the limits box with both kinds', async ({ page, app }) => {
  await app.onboard();
  await app.addCard('SPayLater', payLater);
  await app.addCard('Visa', { ...visa, closes: notToday(20) });
  await page.goto('/');

  await expect(page.getByRole('button', { name: /^Showing all accounts/ })).toBeVisible();
  await expect(app.limits()).toBeVisible();
  await expect(app.limits()).toContainText('Credit card');
  await expect(app.limits()).toContainText('Pay later');
  await expect(app.limits()).toContainText('Rp10.400.000');
  await expect(app.limits()).toContainText('Rp21.000.000');
  await expect(app.limits()).not.toContainText('Not in total');
  await app.limits().scrollIntoViewIfNeeded();
  await app.shot('8-home-all-accounts');
});

test('add a credit card: what is used splits into the last bill and spent since', async ({
  page,
  app,
}) => {
  const closes = notToday(25);
  await app.onboard();
  await page.goto('/');
  await app.openAccounts();
  await page.getByRole('button', { name: 'Add account' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add account' });
  await sheet.getByRole('textbox', { name: 'Name' }).fill('BCA Card');
  await sheet.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'Credit card' });
  await sheet.getByRole('textbox', { name: 'Limit' }).fill('10000000');
  await sheet
    .getByRole('combobox', { name: 'Bill closes on day' })
    .selectOption({ label: String(closes) });
  await sheet.getByRole('combobox', { name: 'Pay by day' }).selectOption({ label: '10' });
  await sheet.getByRole('textbox', { name: 'Unpaid on the last bill' }).fill('2000000');
  await sheet.getByRole('textbox', { name: 'Spent since the last bill' }).fill('500000');
  await app.shot('9-add-credit-card');
  await sheet.getByRole('button', { name: 'Add account' }).tap();
  await expect(sheet).toBeHidden();

  const bca = await app.account('BCA Card');
  expect(bca).toMatchObject({
    kind: 'CREDIT_CARD',
    credit_limit: 10_000_000,
    statement_day: closes,
    due_day: 10,
  });
  expect(await app.balance('BCA Card')).toBe(-2_500_000);
  expect(await app.bill(bca.id)).toMatchObject({ bill: 2_000_000, spentSince: 500_000 });
});

test('a card has no pockets: Add pocket leaves cards out, the server refuses one', async ({
  page,
  app,
}) => {
  await app.onboard();
  await app.addCard('SPayLater', payLater);
  const card = await app.addCard('Visa', visa);
  await page.goto('/');
  await app.openAccounts();

  await page.getByRole('button', { name: 'Add pocket' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add pocket' });
  const inside = sheet.getByRole('combobox', { name: 'Inside' }).getByRole('option');
  await expect(inside.filter({ hasText: 'Main Account' })).toHaveCount(1);
  await expect(inside.filter({ hasText: /^(Visa|SPayLater)$/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  const refused = await page.request.post('/api/envelopes', {
    data: { accountId: card.id, name: 'Rent', kind: 'SPENDING' },
  });
  expect(refused.ok()).toBe(false);
  expect(await refused.text()).toContain('CARD_POCKETS');
});

test('Edit account: a bank with money in it can not turn into a card', async ({ page, app }) => {
  await app.onboard();
  await app.setBalance('Main Account', 5_000_000);
  await page.goto('/');
  await app.openAccounts();

  await page.getByRole('button', { name: /^Main Account/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Main Account' });
  await sheet.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'Credit card' });
  await expect(sheet.getByRole('button', { name: 'Enter the limit' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Limit' }).fill('10000000');
  await sheet.getByRole('combobox', { name: 'Bill closes on day' }).selectOption({ label: '20' });
  await sheet.getByRole('combobox', { name: 'Pay by day' }).selectOption({ label: '5' });
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(page.getByText('already has entries or pockets')).toBeVisible();
  await app.shot('10a-bank-to-card-locked');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await app.account('Main Account')).toMatchObject({ kind: 'BANK', credit_limit: null });
  expect(await app.balance('Main Account')).toBe(5_000_000);
});

test('Edit account: a card keeps its limit and bill days, and can change them', async ({
  page,
  app,
}) => {
  await app.onboard();
  await app.addCard('Visa', visa);
  await page.goto('/');
  await app.openAccounts();

  await page.getByRole('button', { name: /^Visa/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Visa' });
  await sheet.getByRole('textbox', { name: 'Limit' }).fill('');
  await expect(sheet.getByRole('button', { name: 'Enter the limit' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Limit' }).fill('15000000');
  await sheet.getByRole('combobox', { name: 'Bill closes on day' }).selectOption({ label: '25' });
  await app.shot('10-edit-card');
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(sheet).toBeHidden();
  expect(await app.account('Visa')).toMatchObject({
    credit_limit: 15_000_000,
    statement_day: 25,
    due_day: 5,
  });
});

test('a card from before (no bill days) asks for them where its bill goes', async ({
  page,
  app,
}) => {
  await app.onboard();
  const spl = await app.addCard('SPayLater', payLater);
  // Cards made before slice 1 have no bill days. The API refuses that now, so clear them in the database itself.
  sql(`UPDATE accounts SET statement_day = NULL, due_day = NULL WHERE id = '${spl.id}'`);
  await page.goto('/');
  await app.tab('Money').tap();
  await app.pick('SPayLater');
  const bill = page.getByRole('region', { name: 'Card bill' });
  await expect(bill).toContainText('needs its limit and bill days');
  await app.shot('11-old-card');
  await bill.getByRole('button', { name: 'Set limit and bill days ▸' }).tap();
  const sheet = page.getByRole('dialog', { name: 'SPayLater' });
  await expect(sheet.getByRole('button', { name: 'Pick the bill days' })).toBeDisabled();
  await sheet
    .getByRole('combobox', { name: 'Bill closes on day' })
    .selectOption({ label: 'Last day (31)' });
  await sheet.getByRole('combobox', { name: 'Pay by day' }).selectOption({ label: '5' });
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(sheet).toBeHidden();
  await expect(bill.getByRole('button', { name: 'Set limit and bill days ▸' })).toHaveCount(0);
  await expect(bill).not.toContainText('needs its limit');
  expect(await app.account('SPayLater')).toMatchObject({ statement_day: 31, due_day: 5 });
});
