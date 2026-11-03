// Step 6: a goal's activity log (balance after each entry, across pages) and how it stands (progress, needed per cycle).
import { beforeAll, describe, expect, it } from 'vitest';
import { goalOutlook } from '../src/modules/pockets/service';
import { world, type World } from './world';

let w: World;
// Tuesday 10 Nov 2026, 10:00 in Jakarta.
const NOW = Date.parse('2026-11-10T03:00:00Z');
beforeAll(() => {
  w = world({ now: () => NOW });
});

let n = 0;
/** A workspace with BCA (Rp 20.000.000 in Main) and the Holiday goal: 10,000,000 by 2027-03-31. */
async function holiday(o: { targetDate?: string | null; currency?: string } = {}) {
  const ws = (await w.repos.workspaces.ensure(`goal${++n}@test`)).workspaceId;
  const s = w.svc(ws);
  const bca = await s.accounts.create({
    name: 'BCA',
    kind: 'BANK',
    currency: o.currency ?? 'IDR',
    openingBalance: 20_000_000,
  });
  const main = bca.default_envelope_id!;
  const goal = await s.pockets.create({
    accountId: bca.id,
    name: 'Holiday',
    kind: 'GOAL',
    targetAmount: 10_000_000,
    targetDate: o.targetDate === undefined ? '2027-03-31' : o.targetDate,
  });
  const move = async (from: string, to: string, amount: number, date: string) =>
    (
      await s.ledger.record([
        { type: 'ALLOCATE', fromEnvelopeId: from, toEnvelopeId: to, amount, date },
      ])
    )[0];
  return { ws, s, bca, main, goal, move };
}

/** The plan's fixture: in 500k (Sep 10), back 500k (Sep 14), in 2M (Oct 2), in 1M (Oct 25). */
async function fixture(o: Parameters<typeof holiday>[0] = {}) {
  const h = await holiday(o);
  const ids = [
    await h.move(h.main, h.goal.id, 500_000, '2026-09-10'),
    await h.move(h.goal.id, h.main, 500_000, '2026-09-14'),
    await h.move(h.main, h.goal.id, 2_000_000, '2026-10-02'),
    await h.move(h.main, h.goal.id, 1_000_000, '2026-10-25'),
  ];
  return { ...h, ids };
}

const lines = (
  items: { occurred_at: string; pocket: { amount: number; balanceAfter: number } }[],
) => items.map(i => [i.occurred_at.slice(0, 10), i.pocket.amount, i.pocket.balanceAfter]);

describe('goal activity log', () => {
  it('lists every movement newest first with the balance after each (T6.1)', async () => {
    const { s, goal } = await fixture();
    const r = await s.pockets.activity(goal.id);
    expect(lines(r.items)).toEqual([
      ['2026-10-25', 1_000_000, 3_000_000],
      ['2026-10-02', 2_000_000, 2_000_000],
      ['2026-09-14', -500_000, 0],
      ['2026-09-10', 500_000, 500_000],
    ]);
    expect(r.nextCursor).toBeNull();
    expect(r.items[0].command).toMatchObject({ type: 'ALLOCATE' });
  });

  it('works out progress, cycles left and the amount needed per cycle (T6.2)', async () => {
    const { s, goal } = await fixture();
    expect((await s.pockets.activity(goal.id)).goal).toEqual({
      currency: 'IDR',
      balance: 3_000_000,
      target: 10_000_000,
      targetDate: '2027-03-31',
      progress: 30,
      state: 'ON_THE_WAY',
      cyclesLeft: 5,
      neededPerCycle: 1_400_000,
    });
  });

  it('shows spending out of the goal as a negative line (T6.9) and a transfer plus its fee as one line (Q34)', async () => {
    const { ws, s, bca, goal } = await fixture();
    const food = (await w.repos.categories.list(ws)).find(c => c.name === 'Food & Drink')!.id;
    await s.ledger.record([
      {
        type: 'EXPENSE',
        accountId: bca.id,
        envelopeId: goal.id,
        categoryId: food,
        amount: 250_000,
        date: '2026-11-01',
      },
    ]);
    const dailies = (await w.repos.accounts.list(ws)).find(a => a.name === 'Dailies')!;
    await s.ledger.record([
      {
        type: 'TRANSFER',
        fromAccountId: bca.id,
        toAccountId: dailies.id,
        fromEnvelopeId: goal.id,
        amount: 500_000,
        fee: 6_500,
        date: '2026-11-05',
      },
    ]);
    const r = await s.pockets.activity(goal.id);
    expect(lines(r.items).slice(0, 2)).toEqual([
      ['2026-11-05', -506_500, 2_243_500],
      ['2026-11-01', -250_000, 2_750_000],
    ]);
    expect(r.goal.balance).toBe(2_243_500);
  });

  it('shows a transfer in from another account and income into the goal as positive lines (T6.10)', async () => {
    const { ws, s, bca, goal } = await fixture();
    const dailies = (await w.repos.accounts.list(ws)).find(a => a.name === 'Dailies')!;
    await s.accounts.reconcile(dailies.id, { actual: 1_000_000 });
    await s.ledger.record([
      {
        type: 'TRANSFER',
        fromAccountId: dailies.id,
        toAccountId: bca.id,
        toEnvelopeId: goal.id,
        amount: 400_000,
        date: '2026-11-03',
      },
    ]);
    const salary = (await w.repos.categories.list(ws)).find(
      c => c.kind === 'INCOME' && c.name !== 'Balance adjustment',
    )!.id;
    await s.ledger.record([
      {
        type: 'INCOME',
        accountId: bca.id,
        envelopeId: goal.id,
        categoryId: salary,
        amount: 100_000,
        date: '2026-11-04',
      },
    ]);
    expect(lines((await s.pockets.activity(goal.id)).items).slice(0, 2)).toEqual([
      ['2026-11-04', 100_000, 3_500_000],
      ['2026-11-03', 400_000, 3_400_000],
    ]);
  });

  it('drops a deleted entry and moves every balance after an edited one (T6.11, T6.12)', async () => {
    const { s, goal, ids, main } = await fixture();
    await s.ledger.remove(ids[3]);
    let r = await s.pockets.activity(goal.id);
    expect(r.items).toHaveLength(3);
    expect(r.goal).toMatchObject({ balance: 2_000_000, progress: 20 });
    await s.ledger.edit(ids[2], {
      type: 'ALLOCATE',
      fromEnvelopeId: main,
      toEnvelopeId: goal.id,
      amount: 1_500_000,
      date: '2026-10-02',
    });
    r = await s.pockets.activity(goal.id);
    expect(lines(r.items)[0]).toEqual(['2026-10-02', 1_500_000, 1_500_000]);
  });

  it('keeps the balance after each line right across pages (T6.13)', async () => {
    const { s, goal, main, move } = await holiday();
    for (let d = 0; d < 60; d++)
      await move(main, goal.id, 1_000, `2026-09-${String(1 + (d % 30)).padStart(2, '0')}`);
    const p1 = await s.pockets.activity(goal.id);
    expect(p1.items).toHaveLength(50);
    expect(p1.items[0].pocket.balanceAfter).toBe(60_000);
    expect(p1.items[49].pocket.balanceAfter).toBe(11_000);
    const p2 = await s.pockets.activity(goal.id, p1.nextCursor!);
    expect(p2.items).toHaveLength(10);
    expect(p2.items.map(i => i.pocket.balanceAfter)).toEqual(
      [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(k => k * 1_000),
    );
    expect(p2.nextCursor).toBeNull();
  });

  it("refuses pockets that are not goals, and another workspace's goal (T6.14, T6.15)", async () => {
    const { s, bca, goal } = await holiday();
    const spend = await s.pockets.create({ accountId: bca.id, name: 'Food', kind: 'SPENDING' });
    const save = await s.pockets.create({ accountId: bca.id, name: 'Rainy day', kind: 'SAVINGS' });
    await expect(s.pockets.activity(spend.id)).rejects.toMatchObject({ code: 'NOT_A_GOAL' });
    await expect(s.pockets.activity(save.id)).rejects.toMatchObject({ code: 'NOT_A_GOAL' });
    const other = await holiday();
    await expect(other.s.pockets.activity(goal.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps a foreign goal in its own currency (T6.16)', async () => {
    const { s, goal, main, move } = await holiday({ currency: 'USD' });
    await move(main, goal.id, 300_000, '2026-10-02');
    const r = await s.pockets.activity(goal.id);
    expect(r.goal).toMatchObject({
      currency: 'USD',
      balance: 300_000,
      target: 10_000_000,
      progress: 3,
    });
    expect(r.items[0].pocket).toEqual({ amount: 300_000, balanceAfter: 300_000 });
  });

  it('has no needed line without a target date, but still shows progress (T6.6)', async () => {
    const { s, goal } = await fixture({ targetDate: null });
    expect((await s.pockets.activity(goal.id)).goal).toMatchObject({
      progress: 30,
      state: 'ON_THE_WAY',
      cyclesLeft: null,
      neededPerCycle: null,
    });
  });
});

describe('goal outlook', () => {
  const base = {
    balance: 3_000_000,
    target: 10_000_000,
    targetDate: '2027-03-31',
    today: '2026-11-10',
    startDay: 1,
  };

  it('rounds the amount needed up (T6.3)', () => {
    expect(goalOutlook({ ...base, balance: 3_000_001 }).neededPerCycle).toBe(1_400_000);
    expect(goalOutlook({ ...base, balance: 2_999_999 }).neededPerCycle).toBe(1_400_001);
  });

  it('asks for the whole rest when the date is later in this cycle (T6.4)', () => {
    expect(goalOutlook({ ...base, targetDate: '2026-11-25' })).toMatchObject({
      state: 'ON_THE_WAY',
      cyclesLeft: 1,
      neededPerCycle: 7_000_000,
    });
  });

  it('is past the target date once the date is before today, even inside this cycle (T6.5, Q35)', () => {
    expect(goalOutlook({ ...base, targetDate: '2026-10-31' })).toMatchObject({
      state: 'PAST_TARGET_DATE',
      cyclesLeft: null,
      neededPerCycle: null,
    });
    expect(goalOutlook({ ...base, targetDate: '2026-11-05' })).toMatchObject({
      state: 'PAST_TARGET_DATE',
      neededPerCycle: null,
    });
    expect(goalOutlook({ ...base, targetDate: '2026-11-10' })).toMatchObject({
      state: 'ON_THE_WAY',
      cyclesLeft: 1,
      neededPerCycle: 7_000_000,
    });
  });

  it('is reached at the target or above, even after the date (T6.7, Q36)', () => {
    expect(goalOutlook({ ...base, balance: 10_000_000 })).toMatchObject({
      state: 'REACHED',
      progress: 100,
      neededPerCycle: null,
    });
    expect(goalOutlook({ ...base, balance: 10_200_000, targetDate: '2026-10-31' })).toMatchObject({
      state: 'REACHED',
      progress: 102,
    });
    expect(goalOutlook({ ...base, balance: 9_960_000 }).progress).toBe(99);
  });

  it('counts cycles from the running one through the one holding the date (T6.8)', () => {
    expect(goalOutlook({ ...base, startDay: 25 }).cyclesLeft).toBe(6);
  });
});
