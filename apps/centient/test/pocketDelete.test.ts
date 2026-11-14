// Deleting a pocket: only a hidden one, never Main; what was in it moves to the account's Main pocket, a move
// between the two disappears, and the name is free again.
import { beforeAll, describe, expect, it } from 'vitest';
import { world, type World } from './world';

let w: World;
const NOW = Date.parse('2026-11-13T03:00:00Z');
beforeAll(() => {
  w = world({ now: () => NOW });
});

let n = 0;
async function setup() {
  const ws = (await w.repos.workspaces.ensure(`pd${++n}@test`)).workspaceId;
  const s = w.svc(ws);
  const bca = await s.accounts.create({ name: 'BCA', kind: 'BANK', openingBalance: 100_000 });
  const main = bca.default_envelope_id!;
  const food = (await w.repos.categories.list(ws)).find(c => c.name === 'Food & Drink')!.id;
  const what = await s.pockets.create({ accountId: bca.id, name: 'what', kind: 'SPENDING' });
  const balances = () => w.repos.entries.balances(ws);
  return { ws, s, bca, main, food, what, balances };
}

describe('deleting a pocket', () => {
  it('moves its entries to Main, drops the moves between them, and frees the name', async () => {
    const t = await setup();
    // Main -> what 10.000, then Kopi 10.000 spent from what: what is back to zero and can be hidden.
    const [move] = await t.s.ledger.record([
      {
        type: 'ALLOCATE',
        fromEnvelopeId: t.main,
        toEnvelopeId: t.what.id,
        amount: 10_000,
        date: '2026-11-13',
      },
    ]);
    const [kopi] = await t.s.ledger.record([
      {
        type: 'EXPENSE',
        accountId: t.bca.id,
        envelopeId: t.what.id,
        categoryId: t.food,
        amount: 10_000,
        date: '2026-11-13',
        merchant: 'kopi',
      },
    ]);
    await t.s.pockets.update(t.what.id, { archived: true });
    const before = await t.balances();

    await t.s.pockets.remove(t.what.id);

    const after = await t.balances();
    expect(after.accounts[t.bca.id]).toBe(before.accounts[t.bca.id]);
    expect(after.envelopes[t.main]).toBe(90_000);
    expect(after.envelopes[t.what.id]).toBeUndefined();
    // The move between the two is gone; Kopi now lives in Main, and its saved command says so.
    expect(await t.s.ledger.entry(move).catch(e => e.code)).toBe('NOT_FOUND');
    const k = await t.s.ledger.entry(kopi);
    expect(k.transactions[0].allocations).toEqual([{ envelope_id: t.main, amount: -10_000 }]);
    expect((k.command as { envelopeId: string }).envelopeId).toBe(t.main);
    // Gone from the catalog, and the name can be used again.
    expect((await w.repos.envelopes.list(t.ws)).some(e => e.id === t.what.id)).toBe(false);
    await expect(
      t.s.pockets.create({ accountId: t.bca.id, name: 'what', kind: 'SPENDING' }),
    ).resolves.toMatchObject({ name: 'what' });
    // Kopi can still be edited (its pocket is Main now).
    await expect(
      t.s.ledger.edit(kopi, {
        type: 'EXPENSE',
        accountId: t.bca.id,
        envelopeId: t.main,
        categoryId: t.food,
        amount: 12_000,
        date: '2026-11-13',
        merchant: 'kopi',
      }),
    ).resolves.toBeGreaterThan(0);
  });

  it('keeps money that landed after hiding: it moves to Main', async () => {
    const t = await setup();
    await t.s.pockets.update(t.what.id, { archived: true });
    // As the Kopi that arrived from an offline phone before hidden pockets were refused: written straight in.
    await w.repos.batch(
      w.repos.entries.insertStatements(t.ws, [
        {
          kind: 'USER',
          command: null,
          txs: [
            {
              type: 'EXPENSE',
              occurredAt: '2026-11-13T03:00:00.000Z',
              categoryId: t.food,
              merchant: 'kopi',
              note: null,
              entries: [{ accountId: t.bca.id, amount: -7_000 }],
              allocations: [{ envelopeId: t.what.id, amount: -7_000 }],
            },
          ],
        },
      ]).stmts,
    );
    await t.s.pockets.remove(t.what.id);
    expect((await t.balances()).envelopes[t.main]).toBe(93_000);
  });

  it('refuses a pocket that is not hidden, and Main', async () => {
    const t = await setup();
    await expect(t.s.pockets.remove(t.what.id)).rejects.toMatchObject({
      code: 'POCKET_NOT_HIDDEN',
    });
    await expect(t.s.pockets.remove(t.main)).rejects.toMatchObject({ code: 'MAIN_POCKET' });
  });
});
