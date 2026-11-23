// End to end: cards & pay later, slice 0 (planning/features/product/cards-paylater.agent.md, `b56566c`). A card or
// pay later with a limit shows what is LEFT of it (limit − used) wherever an account shows an amount: Money's hand
// and hero, Home's account picker and headline. Its debt never counts in "Your money". Home on All accounts sums
// each kind in the limits box (one row per kind, a chip with the count, a bar in the kind's colour).
// Same pattern as cards.e2e.ts: fresh workspace per test, seeded by API, reset at the end of the file.
import { expect, sql, test, type CardSeed } from './cardsApp';

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/workspace/reset');
});
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.request.post('/api/workspace/reset');
  await page.close();
});

/** 12jt limit, 1.6jt used (1jt on the last bill, 600rb since): 10.4jt left. Closing day doesn't matter here. */
const visa: CardSeed = {
  kind: 'CREDIT_CARD',
  limit: 12_000_000,
  closes: 20,
  due: 5,
  billed: 1_000_000,
  since: 600_000,
};
const bca: CardSeed = {
  kind: 'CREDIT_CARD',
  limit: 8_000_000,
  closes: 25,
  due: 10,
  since: 400_000,
};
const payLater: CardSeed = { kind: 'PAYLATER', limit: 21_000_000, closes: 31, due: 5 };

test('a card shows what is left of its limit everywhere, and its debt stays out of your money', async ({
  page,
  app,
}) => {
  await app.onboard();
  await app.setBalance('Main Account', 5_000_000);
  await app.addCard('Visa', visa);
  await page.goto('/');
  const head = page.getByRole('region', { name: 'Your money' });

  await test.step('Home, all accounts: your money leaves the card out; the box shows its limit', async () => {
    await expect(page.getByRole('button', { name: /^Showing all accounts/ })).toBeVisible();
    await expect(head).toContainText('Rp5.000.000');
    await expect(head).toContainText('Across 3 accounts'); // Main Account, Dailies, Miscs: not Visa
    await expect(app.limits()).toContainText('Rp10.400.000');
    await expect(app.limits()).toContainText('left to spend');
    await expect(app.limits()).toContainText('Used Rp1.600.000 of Rp12.000.000');
    await app.shot('s0-1-home-all');
  });

  await test.step('Home picker: the card is dealt with what is left, not -1.600.000', async () => {
    await page.getByRole('button', { name: /^Showing all accounts/ }).tap();
    const picker = page.getByRole('dialog', { name: 'Pick an account' });
    await expect(picker.getByRole('button', { name: 'Main Account, Rp5.000.000' })).toBeVisible();
    const card = picker.getByRole('button', { name: 'Visa, Rp10.400.000' });
    await card.focus();
    await card.press('Enter');
    await expect(picker).toBeHidden();
  });

  await test.step('Home on the card: the headline is what is left, with what is owed under it', async () => {
    await expect(head).toContainText('In Visa');
    await expect(head).toContainText('Rp10.400.000');
    await expect(head).toContainText('Left to spend · owed Rp1.600.000');
    await expect(app.limits()).toHaveCount(0); // the box is for All accounts only
    await app.shot('s0-2-home-card');
  });

  await test.step('Money: the hand and the hero say the same, your money still leaves it out', async () => {
    await app.tab('Money').tap();
    const hand = page.getByRole('group', { name: 'Accounts' });
    await expect(hand.getByRole('button', { name: 'Visa, Rp10.400.000' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('Used Rp1.600.000 of Rp12.000.000')).toBeVisible();
    await expect(page.getByText('Rp5.000.000', { exact: true }).first()).toBeVisible();
    await app.shot('s0-3-money-card');
  });

  // Saved: the card's balance is still its debt; only the screens turn it into what is left.
  expect(await app.balance('Visa')).toBe(-1_600_000);
  expect((await app.account('Visa')).credit_limit).toBe(12_000_000);
});

test('spending on the card takes from what is left at once; paying it gives it back', async ({
  page,
  app,
}) => {
  await app.onboard();
  await app.setBalance('Main Account', 5_000_000);
  const card = await app.addCard('Visa', { ...visa, billed: undefined, since: undefined });
  const main = await app.account('Main Account');
  await page.goto('/');
  const head = page.getByRole('region', { name: 'Your money' });
  await expect(app.limits()).toContainText('Rp12.000.000');

  await test.step('log a 250.000 dinner on the card: the box drops, your money stays', async () => {
    await page.getByRole('button', { name: 'Add without typing' }).tap();
    const sheet = page.getByRole('dialog', { name: 'New entry' });
    await sheet.getByRole('textbox', { name: 'What was it?' }).fill('Makan malam');
    await sheet.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Food & Drink' });
    await sheet.getByRole('combobox', { name: 'Paid with' }).selectOption({ label: 'Visa' });
    await sheet.getByRole('textbox', { name: 'Amount' }).fill('250000');
    await sheet.getByRole('button', { name: 'Log it' }).tap();
    await expect(sheet).toBeHidden();
    // No reload: the box and the headline follow the new entry by themselves.
    await expect(app.limits()).toContainText('Rp11.750.000');
    await expect(app.limits()).toContainText('Used Rp250.000 of Rp12.000.000');
    await expect(head).toContainText('Rp5.000.000');
    expect(await app.balance('Visa')).toBe(-250_000);
  });

  await test.step('pay it from Main Account: the limit is whole again, your money is 250.000 less', async () => {
    await app.api('post', '/transactions', {
      type: 'TRANSFER',
      fromAccountId: main.id,
      toAccountId: card.id,
      amount: 250_000,
      date: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10),
    });
    await page.reload();
    await expect(app.limits()).toContainText('Rp12.000.000');
    await expect(app.limits()).toContainText('Used Rp0 of Rp12.000.000');
    await expect(head).toContainText('Rp4.750.000');
  });
});

test('the limits box sums the cards of one kind, and keeps each kind apart', async ({
  page,
  app,
}) => {
  await app.onboard();
  await app.addCard('Visa', visa);
  await app.addCard('BCA Card', bca);
  await app.addCard('SPayLater', payLater);
  await page.goto('/');

  const row = (kind: string) => app.limits().getByRole('listitem').filter({ hasText: kind });
  await expect(app.limits().getByRole('listitem')).toHaveCount(2);
  // Two credit cards: one row, "· 2", left 10.4jt + 7.6jt, used 1.6jt + 400rb of 12jt + 8jt.
  await expect(row('Credit card')).toContainText('Credit card · 2');
  await expect(row('Credit card')).toContainText('Rp18.000.000');
  await expect(row('Credit card')).toContainText('Used Rp2.000.000 of Rp20.000.000');
  // One pay later: no count, nothing used yet.
  await expect(row('Pay later')).not.toContainText('·');
  await expect(row('Pay later')).toContainText('Rp21.000.000');
  await expect(row('Pay later')).toContainText('Used Rp0 of Rp21.000.000');
  await app.limits().scrollIntoViewIfNeeded();
  await app.shot('s0-4-box-two-kinds');
});

test('over the limit: Rp0 left and "Over by" everywhere, never a negative left', async ({
  page,
  app,
}) => {
  await app.onboard();
  await app.addCard('Visa', visa);
  await app.addCard('BCA Card', bca);
  // The bank let it through (or interest and its over-limit fee did): 12.5jt used on a 12jt limit.
  await app.setBalance('Visa', -12_500_000);
  await page.goto('/');
  const head = page.getByRole('region', { name: 'Your money' });

  await test.step('Home box: Visa being over never eats what BCA has left', async () => {
    const row = app.limits().getByRole('listitem').filter({ hasText: 'Credit card' });
    await expect(row).toContainText('Rp7.600.000'); // BCA's 7.6jt, not 7.6jt − 500rb
    await expect(row).toContainText('Over by Rp500.000');
    await expect(row).toContainText('Used Rp12.900.000 of Rp20.000.000');
    await app.limits().scrollIntoViewIfNeeded();
    await app.shot('s0-5-over-box');
  });

  await test.step('Home picker and headline: Rp0, pink, over by 500.000', async () => {
    await page.getByRole('button', { name: /^Showing all accounts/ }).tap();
    const card = page
      .getByRole('dialog', { name: 'Pick an account' })
      .getByRole('button', { name: 'Visa, Rp0, over by Rp500.000' });
    await card.focus();
    await card.press('Enter');
    await expect(head).toContainText('In Visa');
    await expect(head).toContainText('Rp0');
    await expect(head).not.toContainText('-Rp');
    await expect(head).toContainText('Over by Rp500.000 · owed Rp12.500.000');
    await app.shot('s0-5b-over-home');
  });

  await test.step('Money: the hand and the hero say the same', async () => {
    await app.tab('Money').tap();
    await expect(
      page.getByRole('group', { name: 'Accounts' }).getByRole('button', {
        name: 'Visa, Rp0, over by Rp500.000',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('left to spend · Over by Rp500.000')).toBeVisible();
    await expect(page.getByText('Used Rp12.500.000 of Rp12.000.000')).toBeVisible();
    await app.shot('s0-6-over-money', app.picked('CREDIT_CARD'));
  });
  expect(await app.balance('Visa')).toBe(-12_500_000);
});

test('a card from before without a limit shows what it owes, and the box says how many lack one', async ({
  page,
  app,
}) => {
  await app.onboard();
  const old = await app.addCard('Visa', visa);
  await app.addCard('BCA Card', bca);
  // Cards added before slice 0 have no limit; the API refuses that now, so clear it in the database itself.
  sql(`UPDATE accounts SET credit_limit = NULL WHERE id = '${old.id}'`);
  await page.goto('/');

  const row = app.limits().getByRole('listitem').filter({ hasText: 'Credit card' });
  // Left and used are BCA's only, so they add up to its limit; the card without one is owed apart.
  await expect(row).toContainText('Rp7.600.000');
  await expect(row).toContainText(
    'Used Rp400.000 of Rp8.000.000 · + Rp1.600.000 on 1 without a limit',
  );
  await app.limits().scrollIntoViewIfNeeded();
  await app.shot('s0-7-box-one-unset');
});

test('a kind with no limit at all shows what is owed, and its hint leads to Money', async ({
  page,
  app,
}) => {
  await app.onboard();
  const spl = await app.addCard('SPayLater', { ...payLater, since: 300_000 });
  sql(`UPDATE accounts SET credit_limit = NULL WHERE id = '${spl.id}'`);
  await page.goto('/');

  await expect(app.limits()).toContainText('Rp300.000');
  await expect(app.limits()).toContainText('owed');
  await expect(app.limits()).not.toContainText('left to spend');
  await app.shot('s0-8-box-no-limit');
  await app
    .limits()
    .getByRole('button', { name: /^Set the limit in the account's settings/ })
    .tap();
  await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible();
  // Without a limit the card shows its debt as is, not a made-up "left".
  await expect(
    page
      .getByRole('group', { name: 'Accounts' })
      .getByRole('button', { name: 'SPayLater, -Rp300.000' }),
  ).toBeVisible();
});
