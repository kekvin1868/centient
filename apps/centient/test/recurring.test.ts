// Recurring bills: due-date maths, the service against SQLite with the real migrations, a saved expense that
// pays a bill, card statements and "Found in your entries".
import { describe, expect, it } from 'vitest';
import { addMonths } from '../src/domain/cycle';
import {
  costOf,
  dueAfter,
  dueDates,
  looksMonthly,
  pays,
  statementOf,
} from '../src/domain/recurring';
import { world } from './world';

// 10:00 in Jakarta on the given day.
const at = (day: string) => Date.parse(`${day}T03:00:00Z`);

async function workspace(today: string) {
  const clock = { now: at(today) };
  const w = world({ now: () => clock.now });
  const { workspaceId: ws } = await w.repos.workspaces.ensure('recurring@test');
  const svc = () => w.svc(ws);
  const cat = (name: string) =>
    w.repos.categories.list(ws).then(cs => cs.find(c => c.name === name)!.id);
  const bca = await svc().accounts.create({
    name: 'BCA',
    kind: 'BANK',
    openingBalance: 50_000_000,
  });
  const bills = await cat('Home & Bills');
  const netflix = (o: object = {}) =>
    svc().recurring.create({
      name: 'Netflix',
      accountId: bca.id,
      categoryId: bills,
      amount: 120_000,
      everyMonths: 1,
      nextDue: '2026-11-20',
      service: 'netflix',
      ...o,
    });
  const spend = (date: string, amount: number, merchant?: string, accountId = bca.id) =>
    svc().ledger.record([
      { type: 'EXPENSE', accountId, categoryId: bills, amount, date, merchant },
    ]);
  const item = async (id: string) => (await svc().recurring.list()).items.find(i => i.id === id);
  return { w, ws, svc, cat, bca: bca.id, bills, netflix, spend, item, clock };
}

describe('due dates', () => {
  it('adds months and clamps to the month, coming back to the due day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('lists due dates up to a day and stops at the end date', () => {
    const s = { nextDue: '2026-01-31', dueDay: 31, everyMonths: 1, endsOn: null };
    expect(dueDates(s, '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(dueDates({ ...s, everyMonths: 3 }, '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-04-30',
      '2026-07-31',
      '2026-10-31',
    ]);
    expect(dueDates({ ...s, endsOn: '2026-02-28' }, '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
    ]);
    expect(dueAfter({ ...s, endsOn: '2026-02-27' })).toBeNull();
  });

  it('costs a bill per month and per year', () => {
    expect(costOf(120_000, 1)).toEqual({ perMonth: 120_000, perYear: 1_440_000 });
    expect(costOf(600_000, 12)).toEqual({ perMonth: 50_000, perYear: 600_000 });
    expect(costOf(100_000, 3)).toEqual({ perMonth: 33_333, perYear: 400_000 });
  });
});

describe('which expense pays a bill', () => {
  const bill = {
    accountId: 'a',
    amount: 120_000,
    name: 'Netflix',
    service: 'netflix',
    nextDue: '2026-11-20',
  };
  const e = { accountId: 'a', amount: 120_000, date: '2026-11-20' };

  it('matches the amount on the account near the due date', () => {
    expect(pays(bill, e)).toBe(true);
    expect(pays(bill, { ...e, merchant: ' Netflix ' })).toBe(true);
    expect(pays(bill, { ...e, date: '2026-11-10' })).toBe(true);
    expect(pays(bill, { ...e, date: '2026-12-10' })).toBe(true);
  });

  it('refuses another account, amount, merchant or a far date', () => {
    expect(pays(bill, { ...e, accountId: 'b' })).toBe(false);
    expect(pays(bill, { ...e, amount: 119_000 })).toBe(false);
    expect(pays(bill, { ...e, merchant: 'indomaret' })).toBe(false);
    expect(pays(bill, { ...e, date: '2026-11-09' })).toBe(false);
    expect(pays(bill, { ...e, date: '2026-12-11' })).toBe(false);
  });

  it('matches a bill whose amount varies by its name only', () => {
    const pln = { ...bill, amount: null, name: 'PLN', service: 'pln' };
    expect(pays(pln, { ...e, amount: 431_250, merchant: 'pln' })).toBe(true);
    expect(pays(pln, { ...e, amount: 431_250 })).toBe(false);
  });
});

describe('card statement dates', () => {
  it('finds the last cut-off and the due day after it', () => {
    expect(statementOf(20, 5, '2026-11-25')).toEqual({ cutOff: '2026-11-20', dueOn: '2026-12-05' });
    expect(statementOf(20, 5, '2026-11-12')).toEqual({ cutOff: '2026-10-20', dueOn: '2026-11-05' });
    expect(statementOf(20, 5, '2026-11-20')).toEqual({ cutOff: '2026-11-20', dueOn: '2026-12-05' });
    expect(statementOf(5, 25, '2026-11-12')).toEqual({ cutOff: '2026-11-05', dueOn: '2026-11-25' });
    expect(statementOf(31, null, '2026-03-01')).toEqual({ cutOff: '2026-02-28', dueOn: null });
  });
});

describe('spotting a monthly bill', () => {
  const p = (day: string, amount = 54_990) => ({ day, amount });
  it('needs two or more payments a month apart at about the same amount', () => {
    expect(looksMonthly([p('2026-09-03'), p('2026-10-03'), p('2026-11-04')])).toBe(true);
    expect(looksMonthly([p('2026-10-03'), p('2026-11-03', 59_000)])).toBe(true);
    expect(looksMonthly([p('2026-11-03')])).toBe(false);
    expect(looksMonthly([p('2026-10-03'), p('2026-10-10')])).toBe(false);
    expect(looksMonthly([p('2026-10-03'), p('2026-11-03', 99_000)])).toBe(false);
    expect(looksMonthly([])).toBe(false);
  });
});

describe('recurring service', () => {
  it('lists a bill with its due dates and totals per currency', async () => {
    const t = await workspace('2026-11-12');
    const id = await t.netflix();
    const wise = await t.svc().accounts.create({ name: 'Wise', kind: 'BANK', currency: 'USD' });
    await t.svc().recurring.create({
      name: 'iCloud+',
      accountId: wise.id,
      categoryId: t.bills,
      amount: 299,
      everyMonths: 1,
      nextDue: '2026-11-30',
    });
    await t.netflix({ name: 'Domain', amount: 240_000, everyMonths: 12, nextDue: '2027-03-01' });
    const list = await t.svc().recurring.list();
    expect(list.today).toBe('2026-11-12');
    const netflix = list.items.find(i => i.id === id)!;
    expect(netflix).toMatchObject({
      name: 'Netflix',
      currency: 'IDR',
      amount: 120_000,
      nextDue: '2026-11-20',
      service: 'netflix',
      paused: false,
    });
    expect(netflix.dues).toHaveLength(12);
    expect(netflix.dues.at(-1)).toBe('2027-10-20');
    expect(list.items.map(i => i.name)).toEqual(['Netflix', 'iCloud+', 'Domain']);
    expect(list.totals).toEqual([
      { currency: 'IDR', perMonth: 140_000, perYear: 1_680_000 },
      { currency: 'USD', perMonth: 299, perYear: 3588 },
    ]);
  });

  it('refuses a tab, a pocket of another account and an end before the due date', async () => {
    const t = await workspace('2026-11-12');
    const tab = await t.svc().accounts.create({ name: 'Andi', kind: 'IOU' });
    const gopay = await t.svc().accounts.create({ name: 'GoPay', kind: 'EWALLET' });
    await expect(t.netflix({ accountId: tab.id })).rejects.toMatchObject({
      code: 'RECURRING_ACCOUNT',
    });
    await expect(t.netflix({ envelopeId: gopay.default_envelope_id })).rejects.toMatchObject({
      code: 'POCKET_ACCOUNT',
    });
    await expect(t.netflix({ endsOn: '2026-11-19' })).rejects.toMatchObject({
      code: 'RECURRING_ENDS',
    });
    await expect(t.netflix({ nextDue: '2026-02-31' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(t.netflix({ categoryId: await t.cat('Salary') })).rejects.toMatchObject({
      code: 'WRONG_CATEGORY_KIND',
    });
  });

  it('edits, pauses and removes a bill', async () => {
    const t = await workspace('2026-11-12');
    const id = await t.netflix();
    await t.svc().recurring.update(id, { amount: 186_000, nextDue: '2026-11-30' });
    expect(await t.item(id)).toMatchObject({ amount: 186_000, nextDue: '2026-11-30' });
    expect((await t.item(id))!.dues[3]).toBe('2027-02-28');

    await t.svc().recurring.update(id, { paused: true });
    const paused = await t.svc().recurring.list();
    expect(paused.items[0]).toMatchObject({ paused: true, dues: [] });
    expect(paused.totals).toEqual([]);
    await t.svc().recurring.update(id, { paused: false });
    expect((await t.item(id))!.paused).toBe(false);

    await t.svc().recurring.remove(id);
    expect((await t.svc().recurring.list()).items).toEqual([]);
    await expect(t.svc().recurring.remove(id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps bills apart per workspace', async () => {
    const t = await workspace('2026-11-12');
    const id = await t.netflix();
    const { workspaceId: other } = await t.w.repos.workspaces.ensure('someone@else');
    expect((await t.w.svc(other).recurring.list()).items).toEqual([]);
    await expect(t.w.svc(other).recurring.update(id, { amount: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('marks a bill paid: logs the expense and moves it on', async () => {
    const t = await workspace('2026-11-12');
    const id = await t.netflix();
    const entryId = await t.svc().recurring.paid(id, {});
    expect((await t.item(id))!.nextDue).toBe('2026-12-20');
    const { items } = await t.svc().ledger.listEntries({ limit: 10 });
    expect(items.find(e => e.id === entryId)).toMatchObject({
      command: { type: 'EXPENSE', amount: 120_000, merchant: 'Netflix', date: '2026-11-12' },
    });
    const balances = await t.svc().ledger.balances();
    expect(balances.accounts.find(a => a.id === t.bca)!.balance).toBe(50_000_000 - 120_000);
  });

  it('asks for the amount of a bill that varies, and closes a bill paid for the last time', async () => {
    const t = await workspace('2026-11-12');
    const pln = await t.netflix({ name: 'PLN', amount: null, service: 'pln' });
    await expect(t.svc().recurring.paid(pln, {})).rejects.toMatchObject({ code: 'AMOUNT_NEEDED' });
    await t.svc().recurring.paid(pln, { amount: 431_250, date: '2026-11-11' });
    expect((await t.item(pln))!.nextDue).toBe('2026-12-20');

    const trial = await t.netflix({ name: 'Trial', endsOn: '2026-11-30' });
    await t.svc().recurring.paid(trial, {});
    expect(await t.item(trial)).toBeUndefined();
  });

  it('moves a bill on when a logged expense pays it, once', async () => {
    const t = await workspace('2026-11-12');
    const id = await t.netflix();
    await t.spend('2026-11-12', 120_000, 'indomaret');
    await t.spend('2026-11-12', 54_990, 'netflix');
    expect((await t.item(id))!.nextDue).toBe('2026-11-20');
    await t.spend('2026-11-18', 120_000, 'netflix');
    expect((await t.item(id))!.nextDue).toBe('2026-12-20');
    await t.spend('2026-11-18', 120_000, 'netflix');
    expect((await t.item(id))!.nextDue).toBe('2026-12-20');
  });

  it('leaves a paused bill where it is', async () => {
    const t = await workspace('2026-11-12');
    const id = await t.netflix();
    await t.svc().recurring.update(id, { paused: true });
    await t.spend('2026-11-18', 120_000);
    await t.svc().recurring.update(id, { paused: false });
    expect((await t.item(id))!.nextDue).toBe('2026-11-20');
  });

  it("closes an account's bills when the account is deleted", async () => {
    const t = await workspace('2026-11-12');
    await t.netflix();
    await t.svc().accounts.remove(t.bca);
    expect((await t.svc().recurring.list()).items).toEqual([]);
  });
});

describe('card statement', () => {
  it("is what was owed at the cut-off, less what's been paid since", async () => {
    const t = await workspace('2026-11-25');
    const card = await t.svc().accounts.create({
      name: 'BCA Card',
      kind: 'CREDIT_CARD',
      dueDay: 5,
    });
    expect((await t.svc().recurring.list()).cards).toEqual([]);
    await t.svc().accounts.update(card.id, { statement_day: 20 });
    await t.spend('2026-11-01', 700_000, 'tokopedia', card.id);
    await t.spend('2026-11-20', 300_000, 'grab', card.id);
    await t.spend('2026-11-21', 150_000, 'kopi', card.id);
    const bill = async () => (await t.svc().recurring.list()).cards[0];
    expect(await bill()).toEqual({
      accountId: card.id,
      cutOff: '2026-11-20',
      dueOn: '2026-12-05',
      bill: 1_000_000,
      left: 1_000_000,
      spentSince: 150_000,
    });
    await t.svc().ledger.record([
      {
        type: 'TRANSFER',
        fromAccountId: t.bca,
        toAccountId: card.id,
        amount: 400_000,
        date: '2026-11-24',
      },
    ]);
    expect(await bill()).toMatchObject({ bill: 1_000_000, left: 600_000, spentSince: 150_000 });
  });
});

describe('found in your entries', () => {
  it('finds a merchant paid monthly, until it is a bill or hidden', async () => {
    const t = await workspace('2026-11-12');
    for (const day of ['2026-09-03', '2026-10-03', '2026-11-04'])
      await t.spend(day, 54_990, 'Spotify');
    for (const day of ['2026-10-03', '2026-11-04']) await t.spend(day, 65_000, 'YouTube');
    for (const day of ['2026-11-01', '2026-11-03', '2026-11-08'])
      await t.spend(day, 25_000, 'kopi');
    for (const day of ['2026-08-05', '2026-09-05']) await t.spend(day, 99_000, 'gym');

    const found = () => t.svc().recurring.found();
    expect(await found()).toEqual([
      {
        merchant: 'spotify',
        accountId: t.bca,
        categoryId: t.bills,
        amount: 54_990,
        lastPaid: '2026-11-04',
        nextDue: '2026-12-04',
        payments: 3,
      },
      expect.objectContaining({ merchant: 'youtube', payments: 2 }),
    ]);

    await t.svc().recurring.hide(' YouTube ');
    await t.netflix({ name: 'Spotify', amount: 54_990, service: null, nextDue: '2026-12-04' });
    expect(await found()).toEqual([]);
  });
});
