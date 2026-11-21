// Installment plans: the pay later example from the brief (Rp894k x 3, first one paid, shared with a brother).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addMonths } from '../src/modules/installments/service';
import { spreadShare } from '../src/repos/entries';
import type { FileStore } from '../src/repos/files';
import { world as base, type World } from './world';

const NOW = Date.parse('2026-10-17T03:00:00Z'); // Sat 17 Oct 2026, 10:00 Jakarta

function world() {
  const files = new Map<string, { body: ArrayBuffer; contentType: string }>();
  const store: FileStore = {
    async put(k, body, contentType) {
      files.set(k, { body, contentType });
    },
    async get(k) {
      return files.get(k) ?? null;
    },
    async delete(keys) {
      for (const k of keys) files.delete(k);
    },
  };
  return { w: base({ now: () => NOW, store }), files };
}

async function setup(w: World) {
  const { workspaceId: ws } = await w.repos.workspaces.ensure('k@test');
  const s = () => w.svc(ws);
  const bca = await s().accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 });
  // The purchase is already in Kredivo's balance: 2 installments left of Rp894k.
  const kredivo = await s().accounts.create({
    name: 'Kredivo',
    kind: 'PAYLATER',
    creditLimit: 5_000_000,
    statementDay: 20,
    dueDay: 5,
    openingBalance: -1_788_000,
  });
  const balance = async (id: string) =>
    (await s().ledger.balances()).accounts.find(a => a.id === id)?.balance ?? 0;
  const byName = async (n: string) => (await w.repos.accounts.list(ws)).find(a => a.name === n)!;
  return { ws, s, bca: bca.id, kredivo: kredivo.id, balance, byName };
}

describe('installment plans', () => {
  it('splits each installment per person, logs each paid share, and keeps balances right', async () => {
    const { w } = world();
    const t = await setup(w);
    const plan = await t.s().installments.create({
      accountId: t.kredivo,
      name: 'iPhone',
      amountPerInstallment: 894_000,
      installments: 3,
      firstDue: '2026-09-05',
      paidCount: 1,
      myShare: 447_000,
      others: [{ name: 'Brother', share: 447_000 }],
      alreadyInBalance: true,
    });
    const brother = await t.byName('Brother');
    expect(brother.kind).toBe('IOU');
    expect(await t.balance(brother.id)).toBe(894_000); // his half of the 2 installments left is owed to me
    expect(plan).toMatchObject({
      paidCount: 1,
      remaining: 1_788_000,
      next: { no: 2, due: '2026-10-05', left: 894_000, overdue: true },
    });
    expect(plan.schedule.map(s => s.due)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);

    // I pay my half of installment 2 from BCA: 1/2 of 894k.
    let p = await t.s().installments.markPaid(plan.id, 2, 0, { fromAccountId: t.bca });
    expect(await t.balance(t.bca)).toBe(5_000_000 - 447_000);
    expect(await t.balance(t.kredivo)).toBe(-1_788_000 + 447_000);
    expect(p.next).toMatchObject({ no: 2, left: 447_000 });
    await expect(
      t.s().installments.markPaid(plan.id, 2, 0, { fromAccountId: t.bca }),
    ).rejects.toThrow('already paid');

    // Brother pays his half: it comes off what he owes and off the debt.
    p = await t.s().installments.markPaid(plan.id, 2, 1, {});
    expect(await t.balance(brother.id)).toBe(447_000);
    expect(await t.balance(t.kredivo)).toBe(-894_000);
    expect(p).toMatchObject({ paidCount: 2, next: { no: 3, left: 894_000 } });

    // Proof on his share, readable back; type and size are checked.
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    p = await t.s().installments.attachProof(plan.id, 2, 1, {
      name: 'transfer.png',
      type: 'image/png',
      bytes: png,
    });
    const proof = p.schedule[1].shares[1].paid!.proof!;
    expect(proof.filename).toBe('transfer.png');
    expect((await t.s().installments.file(proof.id)).contentType).toBe('image/png');
    await expect(
      t.s().installments.attachProof(plan.id, 2, 1, {
        name: 'x.svg',
        type: 'image/svg+xml',
        bytes: png,
      }),
    ).rejects.toThrow('PDF');
    await expect(
      t
        .s()
        .installments.attachProof(plan.id, 3, 1, { name: 'a.png', type: 'image/png', bytes: png }),
    ).rejects.toThrow('paid first');
    await expect(
      w
        .svc((await w.repos.workspaces.ensure('other@test')).workspaceId)
        .installments.file(proof.id),
    ).rejects.toThrow('not found');

    // Deleting my transfer from activity un-pays my share; undoing his removes his transfer.
    const mine = p.schedule[1].shares[0].paid!.entryId!;
    await t.s().ledger.remove(mine);
    p = (await t.s().installments.list(t.kredivo))[0];
    expect(p.schedule[1].shares[0].paid).toBeNull();
    p = await t.s().installments.markPaid(plan.id, 2, 0, { fromAccountId: t.bca }); // can be paid again
    p = await t.s().installments.unmarkPaid(plan.id, 2, 1);
    expect(await t.balance(brother.id)).toBe(894_000);
    expect(p.schedule[1].shares[1].paid).toBeNull();
  });

  it('logs a new purchase as a split, and only allows proof on shared plans', async () => {
    const { w } = world();
    const t = await setup(w);
    const food = (await w.repos.categories.list(t.ws)).find(c => c.name === 'Shopping')!.id;
    const shared = await t.s().installments.create({
      accountId: t.kredivo,
      name: 'Sofa',
      amountPerInstallment: 900_000,
      installments: 3,
      firstDue: '2026-11-25',
      paidCount: 0,
      myShare: 300_000,
      others: [
        { name: 'Brother', share: 300_000 },
        { name: 'Sister', share: 300_000 },
      ],
      alreadyInBalance: false,
      categoryId: food,
    });
    expect(await t.balance(t.kredivo)).toBe(-1_788_000 - 2_700_000);
    expect(await t.balance((await t.byName('Sister')).id)).toBe(900_000);
    expect(shared.parties.map(x => x.name)).toEqual(['You', 'Brother', 'Sister']);

    const solo = await t.s().installments.create({
      accountId: t.kredivo,
      name: 'Shoes',
      amountPerInstallment: 200_000,
      installments: 2,
      firstDue: '2026-11-01',
      paidCount: 0,
      myShare: 200_000,
      others: [],
      alreadyInBalance: true,
    });
    await t.s().installments.markPaid(solo.id, 1, 0, { fromAccountId: t.bca });
    await expect(
      t.s().installments.attachProof(solo.id, 1, 0, {
        name: 'a.png',
        type: 'image/png',
        bytes: new ArrayBuffer(4),
      }),
    ).rejects.toThrow('shared');

    await expect(
      t.s().installments.create({
        accountId: t.kredivo,
        name: 'Bad',
        amountPerInstallment: 100_000,
        installments: 2,
        firstDue: '2026-11-01',
        paidCount: 0,
        myShare: 40_000,
        others: [{ name: 'Brother', share: 50_000 }],
        alreadyInBalance: true,
      }),
    ).rejects.toThrow('add up');
    await expect(
      t.s().installments.create({
        accountId: t.bca,
        name: 'Bad',
        amountPerInstallment: 100_000,
        installments: 2,
        firstDue: '2026-11-01',
        paidCount: 0,
        myShare: 100_000,
        others: [],
        alreadyInBalance: true,
      }),
    ).rejects.toThrow('pay later');
  });

  it('writes the purchase entries and the plan together: if the plan fails, nothing is logged', async () => {
    const { w } = world();
    const t = await setup(w);
    const shopping = (await w.repos.categories.list(t.ws)).find(c => c.name === 'Shopping')!.id;
    const before = await t.balance(t.kredivo);
    const real = w.repos.installments.planInserts;
    w.repos.installments.planInserts = () => [w.db.prepare('INSERT INTO no_such_table VALUES (1)')];
    await expect(
      t.s().installments.create({
        accountId: t.kredivo,
        name: 'TV',
        amountPerInstallment: 300_000,
        installments: 3,
        firstDue: '2026-11-01',
        paidCount: 0,
        myShare: 300_000,
        others: [],
        alreadyInBalance: false,
        categoryId: shopping,
      }),
    ).rejects.toThrow();
    w.repos.installments.planInserts = real;
    expect(await t.balance(t.kredivo)).toBe(before);
    expect(
      (await t.s().ledger.listEntries({ limit: 50 })).items.some(e =>
        e.transactions.some(x => x.merchant === 'tv'),
      ),
    ).toBe(false);
  });

  it('drops the plans of a deleted account (the Bills page could not pay them)', async () => {
    const { w } = world();
    const t = await setup(w);
    const plan = {
      name: 'Phone',
      amountPerInstallment: 500_000,
      installments: 3,
      firstDue: '2026-11-01',
      paidCount: 0,
      myShare: 500_000,
      others: [],
      alreadyInBalance: true,
    };
    await t.s().installments.create({ ...plan, accountId: t.kredivo });
    const card = await t.s().accounts.create({
      name: 'BCA Card',
      kind: 'CREDIT_CARD',
      creditLimit: 20_000_000,
      statementDay: 20,
      dueDay: 5,
    });
    await t.s().installments.create({ ...plan, accountId: card.id, name: 'Laptop' });
    await t.s().accounts.remove(t.kredivo);
    expect((await t.s().installments.list()).map(p => p.name)).toEqual(['Laptop']);
    expect(await t.s().installments.list(t.kredivo)).toEqual([]);

    // A plan left behind before that fix (account deleted, plan live): migration 0022 deletes it.
    await w.db
      .prepare("UPDATE accounts SET deleted_at = '2026-11-17' WHERE id = ?")
      .bind(card.id)
      .run();
    expect((await t.s().installments.list()).map(p => p.name)).toEqual(['Laptop']);
    const sql = readFileSync(
      new URL('../migrations/0022_orphan_plans.sql', import.meta.url),
      'utf8',
    );
    await w.db.prepare(sql.replace(/^--.*$/gm, '')).run();
    expect(await t.s().installments.list()).toEqual([]);
  });

  it('moves the next unpaid installment and every later one; paid ones stay paid', async () => {
    const { w } = world();
    const t = await setup(w);
    const created = await t.s().installments.create({
      accountId: t.kredivo,
      name: 'Phone',
      amountPerInstallment: 500_000,
      installments: 4,
      firstDue: '2026-01-05',
      paidCount: 1,
      myShare: 500_000,
      others: [],
      alreadyInBalance: true,
    });
    const moved = await t.s().installments.moveDues(created.id, '2026-03-31');
    expect(moved.schedule.map(s => [s.due, s.left])).toEqual([
      ['2026-02-28', 0],
      ['2026-03-31', 500_000],
      ['2026-04-30', 500_000],
      ['2026-05-31', 500_000],
    ]);
    expect(moved.next?.due).toBe('2026-03-31');
    // Moving again after paying the next one starts from the new next.
    await t.s().installments.markPaid(created.id, 2, 0, { fromAccountId: t.bca });
    const again = await t.s().installments.moveDues(created.id, '2026-04-12');
    expect(again.schedule.slice(2).map(s => s.due)).toEqual(['2026-04-12', '2026-05-12']);
  });

  it('counts a new plan purchase in budgets a month at a time, and says the whole amount', async () => {
    const { w } = world();
    const t = await setup(w);
    const shopping = (await w.repos.categories.list(t.ws)).find(c => c.name === 'Shopping')!.id;
    await t.s().budgets.set({ categoryId: shopping, limit: 1_000_000 });
    await t.s().installments.create({
      accountId: t.kredivo,
      name: 'hu,an',
      amountPerInstallment: 234_444,
      installments: 3,
      firstDue: '2026-11-20',
      paidCount: 0,
      myShare: 234_444,
      others: [],
      alreadyInBalance: false,
      categoryId: shopping,
    });
    const spent = async (day: string) =>
      (await t.s().budgets.status(day)).budgets.find(b => b.categoryId === shopping)!.spent;
    // Bought 17 Oct: this cycle and the next two count Rp234.444 each, then nothing.
    expect(await spent('2026-10-17')).toBe(234_444);
    expect(await spent('2026-11-17')).toBe(234_444);
    expect(await spent('2026-12-17')).toBe(234_444);
    expect(await spent('2027-01-17')).toBe(0);
    const { items } = await t.s().ledger.listEntries({ limit: 5 });
    expect(JSON.stringify(items)).toContain(
      'hu,an · Rp703.332 over 3 installments · Rp234.444 a month in budgets',
    );
  });

  it('gives the first cycle of a spread purchase what does not divide evenly', () => {
    const r = { day: '2026-11-18', n: 3, amount: 100 };
    expect(spreadShare(r, '2026-11-01', '2026-12-01')).toBe(34);
    expect(spreadShare(r, '2027-01-01', '2027-02-01')).toBe(33);
    expect(spreadShare(r, '2027-02-01', '2027-03-01')).toBe(0);
  });

  it('keeps due dates on the same day, clamped to short months', () => {
    expect([1, 2, 3].map(k => addMonths('2026-01-31', k))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });
});
