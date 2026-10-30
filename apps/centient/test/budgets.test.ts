// Budgets per currency, the Budget forecast and temporary budgets: services and D1 repos against SQLite with the real migrations.
import { describe, expect, it } from 'vitest';
import { migrationsSql, testD1 } from './d1shim';
import { world } from './world';

// 10:00 in Jakarta on the given day.
const at = (day: string) => Date.parse(`${day}T03:00:00Z`);

async function workspace(today: string, startDay = 1) {
  const clock = { now: at(today) };
  const w = world({ now: () => clock.now });
  const { workspaceId: ws } = await w.repos.workspaces.ensure('budgets@test');
  if (startDay !== 1) await w.repos.workspaces.update(ws, { cycle_start_day: startDay });
  const svc = w.svc(ws);
  const cat = (name: string) => w.repos.categories.list(ws).then(cs => cs.find(c => c.name === name)!.id);
  const bca = await svc.accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 50_000_000 });
  const wise = await svc.accounts.create({ name: 'Wise', kind: 'BANK', currency: 'USD', openingBalance: 100_000 });
  const spend = async (date: string, amount: number, o: { account?: string; category?: string } = {}) =>
    svc.ledger.record([{ type: 'EXPENSE', accountId: o.account ?? bca.id, categoryId: await cat(o.category ?? 'Food & Drink'), amount, date }]);
  return { w, ws, svc, cat, bca: bca.id, wise: wise.id, spend, clock };
}

/** One rupiah Food budget of 3,000,000 with `spent` on the cycle's first day; its row on `today`. */
async function foodRow(today: string, spent: number, o: { from?: string; startDay?: number } = {}) {
  const t = await workspace(today, o.startDay);
  await t.svc.budgets.set({ categoryId: await t.cat('Food & Drink'), limit: 3_000_000 });
  await t.spend(o.from ?? `${today.slice(0, 8)}01`, spent);
  return (await t.svc.budgets.status()).budgets[0];
}

describe('budgets per currency', () => {
  it('refuses a pocket budget in another currency than the pocket', async () => {
    const t = await workspace('2026-11-10');
    await expect(t.svc.budgets.set({ envelopeId: `${t.wise}:main`, currency: 'IDR', limit: 50_000 })).rejects.toMatchObject({ code: 'BUDGET_CURRENCY' });
  });

  it('keeps one budget per category and currency; setting it again updates the limit', async () => {
    const t = await workspace('2026-11-10');
    const food = await t.cat('Food & Drink');
    await t.svc.budgets.set({ categoryId: food, limit: 3_000_000 });
    await t.svc.budgets.set({ categoryId: food, currency: 'USD', limit: 500 });
    await t.svc.budgets.set({ categoryId: food, currency: 'IDR', limit: 2_500_000 });
    const rows = (await t.svc.budgets.status()).budgets;
    expect(rows.map(b => [b.currency, b.limit]).sort()).toEqual([['IDR', 2_500_000], ['USD', 500]]);
  });

  it('counts spending in the budget currency only', async () => {
    const t = await workspace('2026-11-10');
    const food = await t.cat('Food & Drink');
    await t.svc.budgets.set({ categoryId: food, limit: 3_000_000 });
    await t.svc.budgets.set({ categoryId: food, currency: 'USD', limit: 5_000 });
    await t.svc.budgets.set({ envelopeId: `${t.wise}:main`, limit: 10_000 });
    await t.spend('2026-11-02', 100_000);
    await t.spend('2026-11-03', 150_000);
    await t.spend('2026-11-04', 2_000, { account: t.wise });
    await t.spend('2026-11-09', 200_000);
    await t.spend('2026-11-09', 100_000, { category: 'Shopping' });
    const rows = (await t.svc.budgets.status()).budgets;
    expect(rows.find(b => b.categoryId === food && b.currency === 'IDR')!.spent).toBe(450_000);
    expect(rows.find(b => b.categoryId === food && b.currency === 'USD')!.spent).toBe(2_000);
    // A budget on a USD pocket counts its spending (it stayed 0 while spending was rupiah only).
    expect(rows.find(b => b.envelopeId === `${t.wise}:main`)!.spent).toBe(2_000);
  });

  it('keeps each budget currency in the backup', async () => {
    const t = await workspace('2026-11-10');
    await t.svc.budgets.set({ categoryId: await t.cat('Food & Drink'), currency: 'USD', limit: 500 });
    expect((await t.svc.workspace.backup()).budgets.map(b => b.currency_code)).toEqual(['USD']);
  });
});

describe('budget forecast', () => {
  it.each([
    // [label, today, spent, daysGone, projected, status]
    ['day 10, ahead of the limit', '2026-11-10', 1_200_000, 10, 3_600_000, 'LIKELY_OVER'],
    ['day 10, under it', '2026-11-10', 800_000, 10, 2_400_000, 'ON_TRACK'],
    ['day 20, already over', '2026-11-20', 3_100_000, 20, 4_650_000, 'OVER'],
    ['day 1, projected from one day', '2026-11-01', 500_000, 1, 15_000_000, 'LIKELY_OVER'],
    ['day 1, already over', '2026-11-01', 3_500_000, 1, 105_000_000, 'OVER'],
    ['projected exactly the limit', '2026-11-10', 1_000_000, 10, 3_000_000, 'ON_TRACK'],
    ['last day, spent exactly the limit', '2026-11-30', 3_000_000, 30, 3_000_000, 'ON_TRACK'],
    ['day 7, rounded', '2026-11-07', 1_000_000, 7, 4_285_714, 'LIKELY_OVER'],
  ] as const)('%s', async (_, today, spent, daysGone, projected, status) => {
    expect(await foodRow(today, spent)).toMatchObject({ cycleDays: 30, daysGone, projected, status });
  });

  it('uses the cycle length: 31 days in December', async () => {
    expect(await foodRow('2026-12-10', 1_000_000)).toMatchObject({ cycleDays: 31, daysGone: 10, projected: 3_100_000 });
  });

  it('counts from the month start day: the 25th, on Nov 3', async () => {
    expect(await foodRow('2026-11-03', 100_000, { startDay: 25, from: '2026-10-25' })).toMatchObject({ cycleDays: 31, daysGone: 10 });
  });

  it('has no projection for another cycle, only over or on track', async () => {
    const t = await workspace('2026-11-10');
    await t.svc.budgets.set({ categoryId: await t.cat('Food & Drink'), limit: 3_000_000 });
    await t.spend('2026-10-15', 2_000_000);
    expect((await t.svc.budgets.status('2026-10-15')).budgets[0]).toMatchObject({ spent: 2_000_000, projected: null, daysGone: null, status: 'ON_TRACK' });
    await t.spend('2026-10-16', 1_100_000);
    expect((await t.svc.budgets.status('2026-10-15')).budgets[0]).toMatchObject({ spent: 3_100_000, projected: null, status: 'OVER' });
  });
});

describe('migration 0010', () => {
  it('makes existing budgets rupiah and allows one per currency', async () => {
    const [before, after] = migrationsSql().split('-- Budgets per currency:');
    const seed = `
      INSERT INTO workspaces (id, name) VALUES ('w', 'Old');
      INSERT INTO categories (id, workspace_id, name, kind) VALUES ('food', 'w', 'Food', 'EXPENSE'), ('fun', 'w', 'Fun', 'EXPENSE');
      INSERT INTO budgets (id, workspace_id, category_id) VALUES ('b1', 'w', 'food'), ('b2', 'w', 'fun');
    `;
    const db = testD1(`${before}\n${seed}\n-- Budgets per currency:${after}`);
    expect((await db.prepare('SELECT id, currency_code FROM budgets ORDER BY id').all()).results).toEqual([
      { id: 'b1', currency_code: 'IDR' }, { id: 'b2', currency_code: 'IDR' },
    ]);
    await db.prepare("INSERT INTO budgets (id, workspace_id, category_id, currency_code) VALUES ('b3', 'w', 'food', 'USD')").run();
    await expect(db.prepare("INSERT INTO budgets (id, workspace_id, category_id, currency_code) VALUES ('b4', 'w', 'food', 'IDR')").run()).rejects.toThrow();
  });
});

describe('temporary budgets', () => {
  // Clock Nov 10 10:00, Food/IDR cycle budget 3,000,000.
  async function setup(today = '2026-11-10') {
    const t = await workspace(today);
    const food = await t.cat('Food & Drink');
    await t.svc.budgets.set({ categoryId: food, limit: 3_000_000 });
    const temp = (startsOn: string, days: number, o: { limit?: number; currency?: string; categoryId?: string } = {}) =>
      t.svc.budgets.set({ categoryId: o.categoryId ?? food, currency: o.currency, limit: o.limit ?? 250_000, startsOn, days });
    const rows = async () => (await t.svc.budgets.status()).budgets;
    const row = async (id: string) => (await rows()).find(b => b.id === id);
    return { ...t, food, temp, rows, row };
  }

  it('runs [startsOn, startsOn + days) and is live from its start', async () => {
    const t = await setup();
    const id = await t.temp('2026-11-10', 14);
    expect(await t.row(id)).toMatchObject({ startsOn: '2026-11-10', endsOn: '2026-11-24', cycleDays: 14, daysGone: 1, limit: 250_000 });
  });

  it('refuses a start in the past', async () => {
    const t = await setup();
    await expect(t.temp('2026-11-09', 14)).rejects.toMatchObject({ code: 'BUDGET_START_PAST' });
  });

  it('lasts 2 to 90 days', async () => {
    const t = await setup();
    for (const days of [1, 91, 2.5, 0]) await expect(t.temp('2026-11-10', days)).rejects.toMatchObject({ code: 'VALIDATION' });
    await t.temp('2026-11-10', 2);
    expect(await t.row(await t.temp('2026-11-12', 90))).toMatchObject({ endsOn: '2027-02-10' });
  });

  it('is upcoming before its start: listed, nothing spent, no forecast', async () => {
    const t = await setup();
    expect(await t.row(await t.temp('2026-11-20', 14))).toMatchObject({ spent: 0, daysGone: null, projected: null, status: 'ON_TRACK', safePerDay: null });
  });

  it('ends at 00:00 Jakarta on its end date, with no job', async () => {
    const t = await setup();
    const id = await t.temp('2026-11-10', 14);
    t.clock.now = Date.parse('2026-11-23T16:59:00Z'); // Nov 23 23:59 in Jakarta
    expect(await t.row(id)).toMatchObject({ daysGone: 14 });
    expect(await t.svc.budgets.history()).toEqual([]);
    t.clock.now = Date.parse('2026-11-23T17:00:00Z'); // Nov 24 00:00
    expect(await t.row(id)).toBeUndefined();
    expect((await t.svc.budgets.history()).map(h => h.id)).toEqual([id]);
  });

  it('counts its own dates and currency, and leaves the cycle budget as it was', async () => {
    const t = await setup();
    const id = await t.temp('2026-11-10', 14);
    await t.spend('2026-11-10', 100_000);
    await t.spend('2026-11-25', 50_000);
    await t.spend('2026-11-09', 30_000);
    await t.spend('2026-11-11', 5, { account: t.wise });
    const rows = await t.rows();
    expect(rows.find(b => b.id === id)!.spent).toBe(100_000);
    const cycle = rows.find(b => b.startsOn === null)!;
    expect(cycle.spent).toBe(180_000);

    const plain = await setup();
    await plain.spend('2026-11-10', 100_000);
    await plain.spend('2026-11-25', 50_000);
    await plain.spend('2026-11-09', 30_000);
    expect((await plain.rows())[0]).toEqual({ ...cycle, id: expect.any(String), categoryId: plain.food });
  });

  it.each([
    ['ahead of the limit', 100_000, 350_000, 'LIKELY_OVER'],
    ['already over', 260_000, 910_000, 'OVER'],
  ] as const)('forecasts over its own length: day 4 of 14, %s', async (_, spent, projected, status) => {
    const t = await setup('2026-11-07');
    const id = await t.temp('2026-11-07', 14);
    await t.spend('2026-11-07', spent);
    t.clock.now = at('2026-11-10');
    expect(await t.row(id)).toMatchObject({ cycleDays: 14, daysGone: 4, projected, status });
  });

  it('may not overlap another on the same target and currency; back to back is fine', async () => {
    const t = await setup();
    await t.temp('2026-11-10', 14);
    await expect(t.temp('2026-11-20', 7)).rejects.toMatchObject({
      code: 'BUDGET_OVERLAP', message: 'You already have a temporary Food & Drink budget from Nov 10 to Nov 23.',
    });
    await expect(t.temp('2026-11-11', 2)).rejects.toMatchObject({ code: 'BUDGET_OVERLAP' });
    await t.temp('2026-11-24', 7);
    await t.temp('2026-11-12', 7, { currency: 'USD', limit: 50 });
    await t.temp('2026-11-12', 7, { categoryId: await t.cat('Shopping') });
    expect((await t.rows()).length).toBe(5);
  });

  it('sits beside the cycle budget, each with its own numbers', async () => {
    const t = await setup();
    await t.temp('2026-11-10', 14);
    await t.spend('2026-11-02', 400_000);
    expect((await t.rows()).map(b => [b.startsOn, b.limit, b.spent])).toEqual([[null, 3_000_000, 400_000], ['2026-11-10', 250_000, 0]]);
  });

  it('changes its limit when set again with the same start, even once running', async () => {
    const t = await setup('2026-11-07');
    const id = await t.temp('2026-11-07', 14);
    t.clock.now = at('2026-11-10');
    expect(await t.temp('2026-11-07', 14, { limit: 400_000 })).toBe(id);
    expect(await t.row(id)).toMatchObject({ limit: 400_000 });
  });

  it('is gone, not in the history, when removed midway', async () => {
    const t = await setup();
    const id = await t.temp('2026-11-10', 14);
    await t.svc.budgets.remove(id);
    t.clock.now = at('2026-12-01');
    expect(await t.svc.budgets.history()).toEqual([]);
  });

  it('lists the ended ones newest first with what was saved', async () => {
    const t = await setup();
    const first = await t.temp('2026-11-10', 3);
    const second = await t.temp('2026-11-13', 4, { limit: 100_000 });
    await t.spend('2026-11-11', 50_000);
    await t.spend('2026-11-14', 120_000);
    t.clock.now = at('2026-11-20');
    expect(await t.svc.budgets.history()).toEqual([
      { id: second, categoryId: t.food, envelopeId: null, currency: 'IDR', startsOn: '2026-11-13', endsOn: '2026-11-17', limit: 100_000, spent: 120_000, saved: -20_000 },
      { id: first, categoryId: t.food, envelopeId: null, currency: 'IDR', startsOn: '2026-11-10', endsOn: '2026-11-13', limit: 250_000, spent: 50_000, saved: 200_000 },
    ]);
  });

  it('keeps both dates in the backup', async () => {
    const t = await setup();
    await t.temp('2026-11-10', 14);
    expect((await t.svc.workspace.backup()).budgets.map(b => [b.starts_on, b.ends_on])).toEqual([[null, null], ['2026-11-10', '2026-11-24']]);
  });
});

describe('migration 0011', () => {
  it('leaves existing budgets as cycle budgets and lets a temporary one sit beside them', async () => {
    const [before, after] = migrationsSql().split('-- Temporary budgets:');
    const seed = `
      INSERT INTO workspaces (id, name) VALUES ('w', 'Old');
      INSERT INTO categories (id, workspace_id, name, kind) VALUES ('food', 'w', 'Food', 'EXPENSE');
      INSERT INTO budgets (id, workspace_id, category_id, currency_code) VALUES ('b1', 'w', 'food', 'IDR'), ('b2', 'w', 'food', 'USD');
    `;
    const db = testD1(`${before}\n${seed}\n-- Temporary budgets:${after}`);
    expect((await db.prepare('SELECT id, starts_on, ends_on FROM budgets ORDER BY id').all()).results).toEqual([
      { id: 'b1', starts_on: null, ends_on: null }, { id: 'b2', starts_on: null, ends_on: null },
    ]);
    const temp = (id: string, start: string) => db.prepare("INSERT INTO budgets (id, workspace_id, category_id, starts_on, ends_on) VALUES (?, 'w', 'food', ?, '2026-12-01')").bind(id, start).run();
    await temp('t1', '2026-11-10');
    await temp('t2', '2026-11-20');
    await expect(temp('t3', '2026-11-10')).rejects.toThrow();
    await expect(db.prepare("INSERT INTO budgets (id, workspace_id, category_id) VALUES ('b3', 'w', 'food')").run()).rejects.toThrow();
  });
});
