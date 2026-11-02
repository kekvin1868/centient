// Insights (step 4): totals, savings rate, comparison with the previous period, spending by category, cycle names.
// Services and D1 repos against SQLite with the real migrations, on the "November" fixture of the Phase 1 test plan.
import { describe, expect, it } from 'vitest';
import { cycleName, yearStart } from '../src/domain/cycle';
import { world } from './world';

// 10:00 in Jakarta on the given day.
const at = (day: string) => Date.parse(`${day}T03:00:00Z`);

async function workspace(today: string, o: { startDay?: number; email?: string } = {}) {
  const w = world({ now: () => at(today) });
  const { workspaceId: ws } = await w.repos.workspaces.ensure(o.email ?? 'reports@test');
  if (o.startDay) await w.repos.workspaces.update(ws, { cycle_start_day: o.startDay });
  const svc = w.svc(ws);
  const cats = await w.repos.categories.list(ws);
  const cat = (name: string) => cats.find(c => c.name === name)!.id;
  const accounts = await w.repos.accounts.list(ws);
  const main = accounts.find(a => a.name === 'Main Account')!.id;
  const dailies = accounts.find(a => a.name === 'Dailies')!.id;
  const spend = (date: string, amount: number, category = 'Food & Drink', extra: Record<string, unknown> = {}) =>
    svc.ledger.record([{ type: 'EXPENSE', accountId: main, categoryId: cat(category), amount, date, ...extra } as never]);
  const earn = (date: string, amount: number, category = 'Salary') =>
    svc.ledger.record([{ type: 'INCOME', accountId: main, categoryId: cat(category), amount, date }]);
  return { w, ws, svc, cat, main, dailies, spend, earn, insights: (q = {}) => w.svc(ws).reports.insights(q) };
}

/** The "November" fixture: clock 2026-11-10 10:00 Jakarta, cycle starts on the 1st. */
async function november(email?: string) {
  const t = await workspace('2026-11-10', { email });
  const wise = await t.svc.accounts.create({ name: 'Wise', kind: 'BANK', currency: 'USD' });
  await t.earn('2026-10-01', 10_000_000);
  await t.spend('2026-10-03', 400_000);
  await t.spend('2026-10-08', 600_000, 'Shopping');
  await t.spend('2026-10-15', 2_000_000);
  await t.earn('2026-11-01', 10_000_000);
  await t.spend('2026-11-02', 100_000, 'Food & Drink', { merchant: 'indomaret' });
  await t.spend('2026-11-03', 150_000, 'Food & Drink', { merchant: 'indomaret' });
  await t.svc.ledger.record([{ type: 'EXPENSE', accountId: wise.id, categoryId: t.cat('Food & Drink'), amount: 2_000, date: '2026-11-04', merchant: 'starbucks' }]);
  await t.spend('2026-11-05', 50_000, 'Transport', { merchant: 'gojek' });
  const [split] = await t.spend('2026-11-06', 300_000, 'Food & Drink', { merchant: 'warung', split: { people: 3 } });
  await t.earn('2026-11-07', 50_000, 'Balance adjustment');
  const [shopping] = await t.spend('2026-11-08', 800_000, 'Shopping', { merchant: 'tokopedia' });
  await t.spend('2026-11-09', 200_000);
  await t.svc.ledger.record([{ type: 'TRANSFER', fromAccountId: t.main, toAccountId: t.dailies, amount: 1_000_000, fee: 2_500, date: '2026-11-10' }]);
  return { ...t, wise: wise.id, split, shopping };
}

const byName = async (t: Awaited<ReturnType<typeof november>>, rows: { categoryId: string; amount: number }[]) => {
  const cats = await t.w.repos.categories.list(t.ws);
  return Object.fromEntries(rows.map(r => [cats.find(c => c.id === r.categoryId)!.name, r.amount]));
};

describe('insights totals (R4.1 - R4.4)', () => {
  it('T4.1 spending, income and savings rate for the running cycle', async () => {
    const r = await (await november()).insights({ period: 'cycle', currency: 'IDR' });
    expect(r.spending).toBe(1_402_500);
    expect(r.income).toBe(10_000_000);
    expect(r.savingsRate).toBeCloseTo(85.975, 9);
    expect(Math.round(r.savingsRate!)).toBe(86);
  });

  it('T4.2 - T4.4 categories: split bill is my share, a transfer adds only its fee; they sum to the spending', async () => {
    const t = await november();
    const r = await t.insights();
    expect(await byName(t, r.categories)).toEqual({ 'Food & Drink': 550_000, Shopping: 800_000, Transport: 50_000, Fees: 2_500 });
    expect(r.categories.map(c => c.amount)).toEqual([800_000, 550_000, 50_000, 2_500]); // largest first
    expect(r.categories.reduce((s, c) => s + c.amount, 0)).toBe(r.spending);
  });

  it('T4.5 a Balance adjustment is not income', async () => {
    const t = await november();
    await t.earn('2026-11-09', 1_000, 'Opening balance');
    expect((await t.insights()).income).toBe(10_000_000);
  });

  it('T4.6 an installment payment (TRANSFER to a pay later account) is not spending', async () => {
    const t = await november();
    const paylater = await t.svc.accounts.create({ name: 'Kredivo', kind: 'PAYLATER' });
    await t.svc.ledger.record([{ type: 'TRANSFER', fromAccountId: t.main, toAccountId: paylater.id, amount: 500_000, date: '2026-11-10' }]);
    expect((await t.insights()).spending).toBe(1_402_500);
  });

  it('T4.7 a correction filed under a category counts as spending there', async () => {
    const t = await november();
    const bal = (await t.w.repos.entries.balances(t.ws)).accounts[t.main];
    await t.svc.accounts.reconcile(t.main, { actual: bal - 30_000, categoryId: t.cat('Food & Drink') });
    const r = await t.insights();
    expect(r.spending).toBe(1_432_500);
    expect((await byName(t, r.categories))['Food & Drink']).toBe(580_000);
  });

  it('T4.8 USD on its own: no income, no savings rate', async () => {
    const t = await november();
    const r = await t.insights({ currency: 'USD' });
    expect([r.spending, r.income, r.savingsRate]).toEqual([2_000, 0, null]);
    expect(await byName(t, r.categories)).toEqual({ 'Food & Drink': 2_000 });
  });

  it('T4.9 a deleted entry no longer counts', async () => {
    const t = await november();
    await t.svc.ledger.remove(t.shopping);
    expect((await t.insights()).spending).toBe(602_500);
  });

  it('T4.10 an archived category still counts', async () => {
    const t = await november();
    await t.svc.categories.update(t.cat('Shopping'), { archived: true });
    expect((await t.insights()).spending).toBe(1_402_500);
  });

  it('T4.11 another workspace changes nothing', async () => {
    const t = await november('one@test');
    const o = world({ now: () => at('2026-11-10'), db: t.w.db });
    const { workspaceId: ws2 } = await o.repos.workspaces.ensure('two@test');
    const accounts = await o.repos.accounts.list(ws2);
    const food = (await o.repos.categories.list(ws2)).find(c => c.name === 'Food & Drink')!.id;
    await o.svc(ws2).ledger.record([{ type: 'EXPENSE', accountId: accounts[0].id, categoryId: food, amount: 999_000, date: '2026-11-05' }]);
    expect((await t.insights()).spending).toBe(1_402_500);
    expect((await o.svc(ws2).reports.insights()).spending).toBe(999_000);
  });
});

describe('insights periods (R4.5, R4.12)', () => {
  it('T4.12 23:59 on the last day is in, 00:00 on the next is out', async () => {
    const t = await workspace('2026-11-10');
    const [late] = await t.spend('2026-10-31', 1_000);
    const [early] = await t.spend('2026-11-01', 2_000);
    const set = (entry: string, ts: string) => t.w.db.prepare('UPDATE transactions SET occurred_at = ? WHERE group_id = ?').bind(ts, entry).run();
    await set(late, '2026-10-31T23:59:00+07:00');
    await set(early, '2026-11-01T00:00:00+07:00');
    expect((await t.insights({ date: '2026-10-20' })).spending).toBe(1_000);
    expect((await t.insights()).spending).toBe(2_000);
  });

  it('T4.13 a finished cycle by date', async () => {
    const r = await (await november()).insights({ date: '2026-10-15' });
    expect([r.period.from, r.period.to, r.period.month, r.period.year]).toEqual(['2026-10-01', '2026-11-01', 10, 2026]);
    expect([r.spending, r.income]).toEqual([3_000_000, 10_000_000]);
  });

  it('T4.14 start day 25: Oct 25 to Nov 25, named Nov; Oct 24 is out', async () => {
    const t = await workspace('2026-11-03', { startDay: 25 });
    await t.spend('2026-10-24', 1_000);
    await t.spend('2026-10-25', 2_000);
    const r = await t.insights();
    expect([r.period.from, r.period.to, r.period.month]).toEqual(['2026-10-25', '2026-11-25', 11]);
    expect(r.spending).toBe(2_000);
  });

  it('T4.15 the year view: 12 cycles from Jan 1 to Dec 31', async () => {
    const r = await (await november()).insights({ period: 'year' });
    expect([r.period.from, r.period.to, r.period.year, r.period.month]).toEqual(['2026-01-01', '2027-01-01', 2026, null]);
    expect(r.spending).toBe(4_402_500);
  });

  it('T4.15a start day 25: year 2026 runs Dec 25, 2025 to Dec 25, 2026', async () => {
    const r = await (await workspace('2026-06-10', { startDay: 25 })).insights({ period: 'year' });
    expect([r.period.from, r.period.to, r.period.year]).toEqual(['2025-12-25', '2026-12-25', 2026]);
  });

  it('T4.15b a cycle is named by the month holding most of its days', () => {
    expect(cycleName('2026-11-01', 1)).toEqual({ year: 2026, month: 11 });
    expect(cycleName('2026-10-02', 2)).toEqual({ year: 2026, month: 10 });
    expect(cycleName('2026-10-15', 15)).toEqual({ year: 2026, month: 10 });
    expect(cycleName('2026-10-16', 16)).toEqual({ year: 2026, month: 11 });
    expect(cycleName('2026-10-25', 25)).toEqual({ year: 2026, month: 11 });
    expect(cycleName('2025-12-25', 25)).toEqual({ year: 2026, month: 1 });
    expect(cycleName('2026-02-28', 31)).toEqual({ year: 2026, month: 3 }); // clamped start keeps the rule
    expect([yearStart(2026, 1), yearStart(2026, 25)]).toEqual(['2026-01-01', '2025-12-25']);
  });
});

describe('insights comparison (R4.6)', () => {
  it('T4.16 the running cycle compares the same days of October', async () => {
    const r = await (await november()).insights();
    expect(r.period.elapsedDays).toBe(10);
    expect(r.previous).toMatchObject({ from: '2026-10-01', to: '2026-10-11', month: 10, spending: 1_000_000, income: 10_000_000, basis: 'SAME_DAYS' });
  });

  it('T4.17 a finished cycle compares full against full', async () => {
    const r = await (await november()).insights({ date: '2026-10-15' });
    expect(r.previous).toMatchObject({ from: '2026-09-01', to: '2026-10-01', month: 9, basis: 'FULL' });
  });

  it('T4.18 a shorter previous cycle is capped at its length', async () => {
    const t = await workspace('2026-04-23', { startDay: 25 });
    const r = await t.insights();
    expect([r.period.from, r.period.elapsedDays]).toEqual(['2026-03-25', 30]);
    expect(r.previous).toMatchObject({ from: '2026-02-25', to: '2026-03-25', basis: 'SAME_DAYS' });
  });

  it('T4.19 the running year compares the same days of last year', async () => {
    const r = await (await november()).insights({ period: 'year' });
    expect(r.previous).toMatchObject({ from: '2025-01-01', to: '2025-11-11', year: 2025, basis: 'SAME_DAYS' });
  });
});

describe('insights currencies and empty data (R4.7, R4.8, R4.13)', () => {
  it('T4.20 currencies with activity, rupiah first and by default', async () => {
    const r = await (await november()).insights();
    expect([r.currencies, r.currency]).toEqual([['IDR', 'USD'], 'IDR']);
  });

  it('T4.21 only USD has entries: USD is the default', async () => {
    const t = await workspace('2026-11-10');
    const wise = await t.svc.accounts.create({ name: 'Wise', kind: 'BANK', currency: 'USD' });
    await t.svc.ledger.record([{ type: 'EXPENSE', accountId: wise.id, categoryId: t.cat('Food & Drink'), amount: 500, date: '2026-11-04' }]);
    const r = await t.insights();
    expect([r.currencies, r.currency, r.spending]).toEqual([['USD'], 'USD', 500]);
  });

  it('T4.22 a currency with no activity gives zeros', async () => {
    const r = await (await november()).insights({ currency: 'JPY' });
    expect([r.spending, r.income, r.savingsRate, r.categories]).toEqual([0, 0, null, []]);
  });

  it('T4.23 an empty workspace', async () => {
    const r = await (await workspace('2026-11-10')).insights();
    expect(r).toMatchObject({ currencies: [], currency: 'IDR', spending: 0, income: 0, savingsRate: null, categories: [], oldest: null });
    expect(r.previous).toMatchObject({ spending: 0, income: 0 });
  });

  it('T4.34 oldest is the day of the oldest live entry', async () => {
    const t = await november();
    expect((await t.insights()).oldest).toBe('2026-10-01');
    const [first] = (await t.svc.ledger.listEntries({ limit: 200 })).items.slice(-1);
    await t.svc.ledger.remove(first.id);
    expect((await t.insights()).oldest).toBe('2026-10-03');
  });

  it('a negative savings rate when spending is over income', async () => {
    const t = await workspace('2026-11-10');
    await t.earn('2026-11-01', 1_000_000);
    await t.spend('2026-11-02', 1_500_000);
    expect((await t.insights()).savingsRate).toBe(-50);
  });
});
