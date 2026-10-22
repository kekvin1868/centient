// Installment plans: the pay later example from the brief (Rp894k x 3, first one paid, shared with a brother).
import { describe, expect, it } from 'vitest';
import * as inst from '../src/application/installments';
import type { FileStore } from '../src/application/ports';
import * as uc from '../src/application/usecases';
import { D1Catalog, D1Installments, D1Ledger } from '../src/infrastructure/d1';
import { migrationsSql, testD1 } from './d1shim';

const NOW = Date.parse('2026-10-17T03:00:00Z'); // Sat 17 Oct 2026, 10:00 Jakarta

function world() {
  const db = testD1(migrationsSql());
  const files = new Map<string, { body: ArrayBuffer; contentType: string }>();
  const store: FileStore = { async put(k, body, contentType) { files.set(k, { body, contentType }); }, async get(k) { return files.get(k) ?? null; } };
  const deps: uc.Deps = { catalog: new D1Catalog(db), ledger: new D1Ledger(db), installments: new D1Installments(db), files: store, now: () => NOW };
  return { deps, files };
}

async function setup(deps: uc.Deps) {
  const { workspaceId: ws } = await deps.catalog.ensureWorkspace('k@test');
  const bca = await uc.createAccount(deps, ws, { name: 'BCA', kind: 'BANK', openingBalance: 5_000_000 });
  // The purchase is already in Kredivo's balance: 2 installments left of Rp894k.
  const kredivo = await uc.createAccount(deps, ws, { name: 'Kredivo', kind: 'PAYLATER', openingBalance: -1_788_000 });
  const balance = async (id: string) => (await uc.getBalances(deps, ws)).accounts.find(a => a.id === id)?.balance ?? 0;
  const byName = async (n: string) => (await deps.catalog.listAccounts(ws)).find(a => a.name === n)!;
  return { ws, bca: bca.id, kredivo: kredivo.id, balance, byName };
}

describe('installment plans', () => {
  it('splits each installment per person, logs each paid share, and keeps balances right', async () => {
    const { deps } = world();
    const t = await setup(deps);
    const plan = await inst.createPlan(deps, t.ws, {
      accountId: t.kredivo, name: 'iPhone', amountPerInstallment: 894_000, installments: 3, firstDue: '2026-09-05', paidCount: 1,
      myShare: 447_000, others: [{ name: 'Brother', share: 447_000 }], alreadyInBalance: true,
    });
    const brother = await t.byName('Brother');
    expect(brother.kind).toBe('IOU');
    expect(await t.balance(brother.id)).toBe(894_000); // his half of the 2 installments left is owed to me
    expect(plan).toMatchObject({ paidCount: 1, remaining: 1_788_000, next: { no: 2, due: '2026-10-05', left: 894_000, overdue: true } });
    expect(plan.schedule.map(s => s.due)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);

    // I pay my half of installment 2 from BCA: 1/2 of 894k.
    let p = await inst.markPaid(deps, t.ws, plan.id, 2, 0, { fromAccountId: t.bca });
    expect(await t.balance(t.bca)).toBe(5_000_000 - 447_000);
    expect(await t.balance(t.kredivo)).toBe(-1_788_000 + 447_000);
    expect(p.next).toMatchObject({ no: 2, left: 447_000 });
    await expect(inst.markPaid(deps, t.ws, plan.id, 2, 0, { fromAccountId: t.bca })).rejects.toThrow('already paid');

    // Brother pays his half: it comes off what he owes and off the debt.
    p = await inst.markPaid(deps, t.ws, plan.id, 2, 1, {});
    expect(await t.balance(brother.id)).toBe(447_000);
    expect(await t.balance(t.kredivo)).toBe(-894_000);
    expect(p).toMatchObject({ paidCount: 2, next: { no: 3, left: 894_000 } });

    // Proof on his share, readable back; type and size are checked.
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    p = await inst.attachProof(deps, t.ws, plan.id, 2, 1, { name: 'transfer.png', type: 'image/png', bytes: png });
    const proof = p.schedule[1].shares[1].paid!.proof!;
    expect(proof.filename).toBe('transfer.png');
    expect((await inst.getFile(deps, t.ws, proof.id)).contentType).toBe('image/png');
    await expect(inst.attachProof(deps, t.ws, plan.id, 2, 1, { name: 'x.svg', type: 'image/svg+xml', bytes: png })).rejects.toThrow('PDF');
    await expect(inst.attachProof(deps, t.ws, plan.id, 3, 1, { name: 'a.png', type: 'image/png', bytes: png })).rejects.toThrow('paid first');
    await expect(inst.getFile(deps, (await deps.catalog.ensureWorkspace('other@test')).workspaceId, proof.id)).rejects.toThrow('not found');

    // Deleting my transfer from activity un-pays my share; undoing his removes his transfer.
    const mine = p.schedule[1].shares[0].paid!.entryId!;
    await uc.deleteEntry(deps, t.ws, mine);
    p = (await inst.listPlans(deps, t.ws, t.kredivo))[0];
    expect(p.schedule[1].shares[0].paid).toBeNull();
    p = await inst.markPaid(deps, t.ws, plan.id, 2, 0, { fromAccountId: t.bca }); // can be paid again
    p = await inst.unmarkPaid(deps, t.ws, plan.id, 2, 1);
    expect(await t.balance(brother.id)).toBe(894_000);
    expect(p.schedule[1].shares[1].paid).toBeNull();
  });

  it('logs a new purchase as a split, and only allows proof on shared plans', async () => {
    const { deps } = world();
    const t = await setup(deps);
    const food = (await deps.catalog.listCategories(t.ws)).find(c => c.name === 'Shopping')!.id;
    const shared = await inst.createPlan(deps, t.ws, {
      accountId: t.kredivo, name: 'Sofa', amountPerInstallment: 900_000, installments: 3, firstDue: '2026-11-25', paidCount: 0,
      myShare: 300_000, others: [{ name: 'Brother', share: 300_000 }, { name: 'Sister', share: 300_000 }], alreadyInBalance: false, categoryId: food,
    });
    expect(await t.balance(t.kredivo)).toBe(-1_788_000 - 2_700_000);
    expect(await t.balance((await t.byName('Sister')).id)).toBe(900_000);
    expect(shared.parties.map(x => x.name)).toEqual(['You', 'Brother', 'Sister']);

    const solo = await inst.createPlan(deps, t.ws, {
      accountId: t.kredivo, name: 'Shoes', amountPerInstallment: 200_000, installments: 2, firstDue: '2026-11-01', paidCount: 0,
      myShare: 200_000, others: [], alreadyInBalance: true,
    });
    await inst.markPaid(deps, t.ws, solo.id, 1, 0, { fromAccountId: t.bca });
    await expect(inst.attachProof(deps, t.ws, solo.id, 1, 0, { name: 'a.png', type: 'image/png', bytes: new ArrayBuffer(4) })).rejects.toThrow('shared');

    await expect(inst.createPlan(deps, t.ws, {
      accountId: t.kredivo, name: 'Bad', amountPerInstallment: 100_000, installments: 2, firstDue: '2026-11-01', paidCount: 0,
      myShare: 40_000, others: [{ name: 'Brother', share: 50_000 }], alreadyInBalance: true,
    })).rejects.toThrow('add up');
    await expect(inst.createPlan(deps, t.ws, {
      accountId: t.bca, name: 'Bad', amountPerInstallment: 100_000, installments: 2, firstDue: '2026-11-01', paidCount: 0,
      myShare: 100_000, others: [], alreadyInBalance: true,
    })).rejects.toThrow('pay later');
  });

  it('keeps due dates on the same day, clamped to short months', () => {
    expect([1, 2, 3].map(k => inst.addMonths('2026-01-31', k))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
});
