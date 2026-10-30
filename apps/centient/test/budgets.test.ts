// Budgets per currency and the Budget forecast: services and D1 repos against SQLite with the real migrations.
import { describe, expect, it } from 'vitest';
import { migrationsSql, testD1 } from './d1shim';
import { world } from './world';

// 10:00 in Jakarta on the given day.
const at = (day: string) => Date.parse(`${day}T03:00:00Z`);

async function workspace(today: string, startDay = 1) {
  const w = world({ now: () => at(today) });
  const { workspaceId: ws } = await w.repos.workspaces.ensure('budgets@test');
  if (startDay !== 1) await w.repos.workspaces.update(ws, { cycle_start_day: startDay });
  const svc = w.svc(ws);
  const cat = (name: string) => w.repos.categories.list(ws).then(cs => cs.find(c => c.name === name)!.id);
  const bca = await svc.accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 50_000_000 });
  const wise = await svc.accounts.create({ name: 'Wise', kind: 'BANK', currency: 'USD', openingBalance: 100_000 });
  const spend = async (date: string, amount: number, o: { account?: string; category?: string } = {}) =>
    svc.ledger.record([{ type: 'EXPENSE', accountId: o.account ?? bca.id, categoryId: await cat(o.category ?? 'Food & Drink'), amount, date }]);
  return { w, ws, svc, cat, bca: bca.id, wise: wise.id, spend };
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
