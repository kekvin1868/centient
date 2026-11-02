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

// ---- Step 5: trend, Daily Wallet Spending, top merchants, biggest expenses, savings history ----

const values = (trend: { amount: number | null }[]) => trend.map(t => t.amount);

describe('trend (R5.1, R5.2)', () => {
  it('T5.1 daily series: every day of the cycle, values through today, nothing after', async () => {
    const r = await (await november()).insights();
    expect(r.trend).toHaveLength(30);
    expect(values(r.trend).slice(0, 10)).toEqual([0, 100_000, 150_000, 0, 50_000, 100_000, 0, 800_000, 200_000, 2_500]);
    expect(values(r.trend).slice(10).every(v => v === null)).toBe(true);
    expect(values(r.trend).reduce<number>((s, v) => s + (v ?? 0), 0)).toBe(1_402_500);
  });

  it('T5.2 a finished cycle has a value for every day', async () => {
    const r = await (await november()).insights({ date: '2026-10-15' });
    expect(r.trend).toHaveLength(31);
    expect(r.trend.every(t => t.amount !== null)).toBe(true);
    expect(r.trend[0].from).toBe('2026-10-01');
  });

  it('T5.3 year view: one slot per cycle, 11 values, December empty', async () => {
    const r = await (await november()).insights({ period: 'year' });
    expect(values(r.trend)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 3_000_000, 1_402_500, null]);
  });

  it('T5.4 start day 25: the year trend starts with the cycle named January', async () => {
    const t = await workspace('2026-11-10', { startDay: 25 });
    const r = await t.insights({ period: 'year' });
    expect(r.trend[0]).toMatchObject({ from: '2025-12-25', month: 1 });
    expect(r.trend).toHaveLength(12);
  });

  it('T5.5 USD trend has the one coffee', async () => {
    const r = await (await november()).insights({ currency: 'USD' });
    expect(values(r.trend).filter(v => v)).toEqual([2_000]);
    expect(r.trend[3]).toEqual({ from: '2026-11-04', amount: 2_000 });
  });
});

describe('Daily Wallet Spending (R5.3)', () => {
  const show = (rows: { total: number; occurrences: number; average: number | null }[]) => rows.map(r => [r.total, r.occurrences, r.average]);

  it('T5.6 / T5.7 per weekday total, occurrences and average; the USD coffee is not in IDR', async () => {
    const r = await (await november()).insights();
    expect(show(r.weekdays)).toEqual([
      [300_000, 2, 150_000], [152_500, 2, 76_250], [0, 1, 0], [50_000, 1, 50_000], [100_000, 1, 100_000], [0, 1, 0], [800_000, 2, 400_000],
    ]);
    expect(r.weekdays.reduce((s, w) => s + w.total, 0)).toBe(1_402_500);
  });

  it('T5.7a a weekday that has not come round yet has no value', async () => {
    const t = await workspace('2026-11-02');
    await t.spend('2026-11-01', 10_000);
    const r = await t.insights();
    expect(r.weekdays.map(w => w.average)).toEqual([0, null, null, null, null, null, 10_000]);
  });

  it('T5.7b the average rounds to the nearest rupiah', async () => {
    const t = await workspace('2026-11-10');
    await t.spend('2026-11-02', 100_001);
    expect((await t.insights()).weekdays[0]).toEqual({ total: 100_001, occurrences: 2, average: 50_001 });
  });

  it('T5.7c a finished October: 5 Thursdays, Fridays and Saturdays, 4 of the rest', async () => {
    const r = await (await november()).insights({ date: '2026-10-15' });
    expect(r.weekdays.map(w => w.occurrences)).toEqual([4, 4, 4, 5, 5, 5, 4]);
  });

  it('T5.7d year view counts every weekday from the start of the year to today', async () => {
    const r = await (await november()).insights({ period: 'year' });
    // Jan 1 to Nov 10, 2026 = 314 days.
    expect(r.weekdays.reduce((s, w) => s + w.occurrences, 0)).toBe(314);
  });
});

describe('top merchants (R5.4)', () => {
  it('T5.8 total and visits; no merchant and the fee are left out', async () => {
    const r = await (await november()).insights();
    expect(r.merchants.map(m => [m.name, m.total, m.visits])).toEqual([
      ['tokopedia', 800_000, 1], ['indomaret', 250_000, 2], ['warung', 100_000, 1], ['gojek', 50_000, 1],
    ]);
  });

  it('T5.9 / T5.10 capped at 5, equal totals ordered by name', async () => {
    const t = await november();
    for (const m of ['zara', 'alfamart', 'kfc']) await t.spend('2026-11-09', 40_000, 'Food & Drink', { merchant: m });
    const r = await t.insights();
    expect(r.merchants.map(m => m.name)).toEqual(['tokopedia', 'indomaret', 'warung', 'gojek', 'alfamart']);
  });

  it('T5.27 names are grouped ignoring case and spaces, with the latest spelling', async () => {
    const t = await workspace('2026-11-10');
    await t.spend('2026-11-02', 100_000, 'Food & Drink', { merchant: 'Indomaret' });
    await t.spend('2026-11-03', 150_000, 'Food & Drink', { merchant: 'indomaret ' });
    expect((await t.insights()).merchants).toEqual([{ key: 'indomaret', name: 'indomaret', total: 250_000, visits: 2 }]);
  });
});

describe('biggest expenses (R5.5)', () => {
  it('T5.11 - T5.13 my share of a split, ties newest first, the whole entry attached', async () => {
    const t = await november();
    const r = await t.insights();
    expect(r.biggest.map(b => b.amount)).toEqual([800_000, 200_000, 150_000, 100_000, 100_000]);
    expect(r.biggest[0].entry.id).toBe(t.shopping);
    expect(r.biggest[3].entry.id).toBe(t.split); // Nov 6 warung share before the Nov 2 indomaret
    expect(r.biggest[3].entry.command).toMatchObject({ type: 'EXPENSE', amount: 300_000, split: { people: 3 } });
    const { items } = await t.svc.ledger.listEntries({ limit: 50 });
    for (const b of r.biggest) expect(items.some(e => e.id === b.entry.id)).toBe(true);
  });
});

describe('entries filters for the Insights sheets (R5.11)', () => {
  it('T5.31 merchant ignoring case, and currency', async () => {
    const t = await workspace('2026-11-10');
    await t.spend('2026-11-02', 100_000, 'Food & Drink', { merchant: 'Indomaret' });
    await t.spend('2026-11-03', 150_000, 'Food & Drink', { merchant: 'indomaret ' });
    await t.spend('2026-11-04', 1_000, 'Food & Drink', { merchant: 'kfc' });
    const page = (q: object) => t.svc.ledger.listEntries({ limit: 50, from: '2026-11-01', to: '2026-11-30', ...q });
    expect((await page({ merchant: 'indomaret', currency: 'IDR' })).items).toHaveLength(2);
    expect((await page({ merchant: 'indomaret', currency: 'USD' })).items).toHaveLength(0);
  });
});

describe('savings history (R5.6, R5.7)', () => {
  async function food() {
    const t = await workspace('2026-11-10');
    const target = { categoryId: t.cat('Food & Drink'), envelopeId: null, currency: 'IDR' };
    await t.w.repos.budgets.set(t.ws, target, 1_000_000, '2026-08-01');
    await t.w.repos.budgets.set(t.ws, target, 800_000, '2026-10-01');
    await t.spend('2026-08-05', 900_000);
    await t.spend('2026-09-05', 1_100_000);
    await t.spend('2026-10-05', 600_000);
    await t.spend('2026-11-05', 50_000);
    return t;
  }
  const rows = (cycles: { from: string; limit: number; spent: number; saved: number }[]) => cycles.map(c => [c.from, c.limit, c.spent, c.saved]);

  it('T5.14 / T5.18 finished cycles oldest first, each with the limit that applied then', async () => {
    const [b] = await (await food()).svc.budgets.savings({ currency: 'IDR' });
    expect(rows(b.cycles)).toEqual([
      ['2026-08-01', 1_000_000, 900_000, 100_000], ['2026-09-01', 1_000_000, 1_100_000, -100_000], ['2026-10-01', 800_000, 600_000, 200_000],
    ]);
    expect(b.cycles[2]).toMatchObject({ year: 2026, month: 10 });
  });

  it('T5.28 follows the period on screen', async () => {
    const [b] = await (await food()).svc.budgets.savings({ currency: 'IDR', date: '2026-09-15' });
    expect(b.cycles.map(c => c.from)).toEqual(['2026-08-01', '2026-09-01']);
  });

  it('T5.15 / T5.29 at most 6; the year view keeps to that year', async () => {
    const t = await workspace('2026-11-10');
    await t.w.repos.budgets.set(t.ws, { categoryId: t.cat('Food & Drink'), envelopeId: null, currency: 'IDR' }, 1_000_000, '2025-11-01');
    const [cycle] = await t.svc.budgets.savings({});
    expect(cycle.cycles.map(c => c.from)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
    const [last] = await t.svc.budgets.savings({ period: 'year', date: '2025-06-01' });
    expect(last.cycles.map(c => c.from)).toEqual(['2025-11-01', '2025-12-01']);
  });

  it('T5.16 a budget made this cycle has no history yet', async () => {
    const t = await workspace('2026-11-10');
    await t.svc.budgets.set({ categoryId: t.cat('Food & Drink'), limit: 500_000 });
    expect((await t.svc.budgets.savings({}))[0].cycles).toEqual([]);
  });

  it('T5.17 / T5.30 one currency only; temporary budgets never appear', async () => {
    const t = await food();
    await t.svc.budgets.set({ categoryId: t.cat('Food & Drink'), currency: 'USD', limit: 5_000 });
    await t.svc.budgets.set({ categoryId: t.cat('Transport'), limit: 100_000, startsOn: '2026-11-10', days: 7 });
    expect((await t.svc.budgets.savings({ currency: 'USD' })).map(b => b.currency)).toEqual(['USD']);
    expect(await t.svc.budgets.savings({ currency: 'IDR' })).toHaveLength(1);
  });
});
