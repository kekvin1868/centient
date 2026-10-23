// Installment plans: the pay later example from the brief (Rp894k x 3, first one paid, shared with a brother).
import { describe, expect, it } from 'vitest';
import { addMonths } from '../src/modules/installments/service';
import type { FileStore } from '../src/repos/files';
import { world as base, type World } from './world';

const NOW = Date.parse('2026-10-17T03:00:00Z'); // Sat 17 Oct 2026, 10:00 Jakarta

function world() {
  const files = new Map<string, { body: ArrayBuffer; contentType: string }>();
  const store: FileStore = { async put(k, body, contentType) { files.set(k, { body, contentType }); }, async get(k) { return files.get(k) ?? null; } };
  return { w: base({ now: () => NOW, store }), files };
}

async function setup(w: World) {
  const { workspaceId: ws } = await w.repos.workspaces.ensure('k@test');
  const s = () => w.svc(ws);
  const bca = await s().accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 });
  // The purchase is already in Kredivo's balance: 2 installments left of Rp894k.
  const kredivo = await s().accounts.create({ name: 'Kredivo', kind: 'PAYLATER', openingBalance: -1_788_000 });
  const balance = async (id: string) => (await s().ledger.balances()).accounts.find(a => a.id === id)?.balance ?? 0;
  const byName = async (n: string) => (await w.repos.accounts.list(ws)).find(a => a.name === n)!;
  return { ws, s, bca: bca.id, kredivo: kredivo.id, balance, byName };
}

describe('installment plans', () => {
  it('splits each installment per person, logs each paid share, and keeps balances right', async () => {
    const { w } = world();
    const t = await setup(w);
    const plan = await t.s().installments.create({
      accountId: t.kredivo, name: 'iPhone', amountPerInstallment: 894_000, installments: 3, firstDue: '2026-09-05', paidCount: 1,
      myShare: 447_000, others: [{ name: 'Brother', share: 447_000 }], alreadyInBalance: true,
    });
    const brother = await t.byName('Brother');
    expect(brother.kind).toBe('IOU');
    expect(await t.balance(brother.id)).toBe(894_000); // his half of the 2 installments left is owed to me
    expect(plan).toMatchObject({ paidCount: 1, remaining: 1_788_000, next: { no: 2, due: '2026-10-05', left: 894_000, overdue: true } });
    expect(plan.schedule.map(s => s.due)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);

    // I pay my half of installment 2 from BCA: 1/2 of 894k.
    let p = await t.s().installments.markPaid(plan.id, 2, 0, { fromAccountId: t.bca });
    expect(await t.balance(t.bca)).toBe(5_000_000 - 447_000);
    expect(await t.balance(t.kredivo)).toBe(-1_788_000 + 447_000);
    expect(p.next).toMatchObject({ no: 2, left: 447_000 });
    await expect(t.s().installments.markPaid(plan.id, 2, 0, { fromAccountId: t.bca })).rejects.toThrow('already paid');

    // Brother pays his half: it comes off what he owes and off the debt.
    p = await t.s().installments.markPaid(plan.id, 2, 1, {});
    expect(await t.balance(brother.id)).toBe(447_000);
    expect(await t.balance(t.kredivo)).toBe(-894_000);
    expect(p).toMatchObject({ paidCount: 2, next: { no: 3, left: 894_000 } });

    // Proof on his share, readable back; type and size are checked.
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    p = await t.s().installments.attachProof(plan.id, 2, 1, { name: 'transfer.png', type: 'image/png', bytes: png });
    const proof = p.schedule[1].shares[1].paid!.proof!;
    expect(proof.filename).toBe('transfer.png');
    expect((await t.s().installments.file(proof.id)).contentType).toBe('image/png');
    await expect(t.s().installments.attachProof(plan.id, 2, 1, { name: 'x.svg', type: 'image/svg+xml', bytes: png })).rejects.toThrow('PDF');
    await expect(t.s().installments.attachProof(plan.id, 3, 1, { name: 'a.png', type: 'image/png', bytes: png })).rejects.toThrow('paid first');
    await expect(w.svc((await w.repos.workspaces.ensure('other@test')).workspaceId).installments.file(proof.id)).rejects.toThrow('not found');

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
      accountId: t.kredivo, name: 'Sofa', amountPerInstallment: 900_000, installments: 3, firstDue: '2026-11-25', paidCount: 0,
      myShare: 300_000, others: [{ name: 'Brother', share: 300_000 }, { name: 'Sister', share: 300_000 }], alreadyInBalance: false, categoryId: food,
    });
    expect(await t.balance(t.kredivo)).toBe(-1_788_000 - 2_700_000);
    expect(await t.balance((await t.byName('Sister')).id)).toBe(900_000);
    expect(shared.parties.map(x => x.name)).toEqual(['You', 'Brother', 'Sister']);

    const solo = await t.s().installments.create({
      accountId: t.kredivo, name: 'Shoes', amountPerInstallment: 200_000, installments: 2, firstDue: '2026-11-01', paidCount: 0,
      myShare: 200_000, others: [], alreadyInBalance: true,
    });
    await t.s().installments.markPaid(solo.id, 1, 0, { fromAccountId: t.bca });
    await expect(t.s().installments.attachProof(solo.id, 1, 0, { name: 'a.png', type: 'image/png', bytes: new ArrayBuffer(4) })).rejects.toThrow('shared');

    await expect(t.s().installments.create({
      accountId: t.kredivo, name: 'Bad', amountPerInstallment: 100_000, installments: 2, firstDue: '2026-11-01', paidCount: 0,
      myShare: 40_000, others: [{ name: 'Brother', share: 50_000 }], alreadyInBalance: true,
    })).rejects.toThrow('add up');
    await expect(t.s().installments.create({
      accountId: t.bca, name: 'Bad', amountPerInstallment: 100_000, installments: 2, firstDue: '2026-11-01', paidCount: 0,
      myShare: 100_000, others: [], alreadyInBalance: true,
    })).rejects.toThrow('pay later');
  });

  it('keeps due dates on the same day, clamped to short months', () => {
    expect([1, 2, 3].map(k => addMonths('2026-01-31', k))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
});
