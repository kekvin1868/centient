import { describe, expect, it } from 'vitest';
import type { Account } from '../../../../../src/repos/accounts';
import type { Envelope } from '../../../../../src/repos/envelopes';
import { accountBalance, addAccount, addPocket, editPocket, fromCatalog, MAX_ACCOUNTS, moveBalance, removePocket, rename, toggle, type Draft } from './draft';

const acc = (id: string, name: string, kind: string): Account =>
  ({ id, name, kind, provider: null, currency_code: 'IDR', default_envelope_id: `${id}:main`, due_day: null, reconciled_at: null, archived_at: null });
const seed = () => fromCatalog(
  [acc('d', 'Dailies', 'EWALLET'), acc('m', 'Main Account', 'BANK'), acc('x', 'Miscs', 'DEBIT_CARD'), acc('f', 'Friends', 'IOU')],
  [] as Envelope[],
);

describe('draft', () => {
  it('starts from the seeded everyday accounts, bank first, each with Main', () => {
    const d = seed();
    expect(d.map(a => a.name)).toEqual(['Main Account', 'Dailies', 'Miscs']);
    expect(d.every(a => a.pockets.length === 1 && a.pockets[0].main && a.pockets[0].id === `${a.id}:main`)).toBe(true);
  });

  it('drops seeded accounts but deletes added ones', () => {
    let d = seed();
    d = toggle(d, d[1].key);
    expect(d[1].kept).toBe(false);
    d = toggle(d, d[1].key);
    expect(d[1].kept).toBe(true);
    const added = addAccount(d)!;
    expect(toggle(added.draft, added.key)).toHaveLength(3);
  });

  it('stops at 20 accounts', () => {
    let d: Draft = seed();
    while (d.length < MAX_ACCOUNTS) d = addAccount(d)!.draft;
    expect(addAccount(d)).toBeNull();
  });

  it('sums pockets into the account balance, ??? until one is set', () => {
    let d = seed();
    const a = d[0].key;
    expect(accountBalance(d[0])).toBeNull();
    const p = addPocket(d, a);
    d = editPocket(p.draft, a, p.key, { balance: 200 });
    d = editPocket(d, a, d[0].pockets[0].key, { balance: 1000, name: 'Renamed' });
    expect(d[0].pockets[0].name).toBe('Main'); // Main keeps its name
    expect(accountBalance(d[0])).toBe(1200);
    expect(accountBalance(removePocket(d, a, p.key)[0])).toBe(1000);
  });

  it('ignores blank names', () => {
    const d = seed();
    expect(rename(d, d[0].key, '   ')[0].name).toBe('Main Account');
  });

  it('moves balance from one account to another account, into its balance or a pocket', () => {
    let d = seed();
    const [a, b] = d;
    d = editPocket(d, a.key, a.pockets[0].key, { balance: 1000 });
    const r = addPocket(d, b.key);
    d = r.draft;
    d = moveBalance(d, a.key, b.key, b.pockets[0].key, 300);
    d = moveBalance(d, a.key, b.key, r.key, 200);
    expect(d[0].pockets[0].balance).toBe(500);
    expect(d[1].pockets.map(p => p.balance)).toEqual([300, 200]);
    expect(accountBalance(d[0])! + accountBalance(d[1])!).toBe(1000);
  });

  it('refuses a move larger than the balance, to itself, or of nothing', () => {
    let d = seed();
    d = editPocket(d, d[0].key, d[0].pockets[0].key, { balance: 100 });
    const to = d[1].pockets[0].key;
    expect(moveBalance(d, d[0].key, d[1].key, to, 101)).toBe(d);
    expect(moveBalance(d, d[0].key, d[0].key, d[0].pockets[0].key, 50)).toBe(d);
    expect(moveBalance(d, d[0].key, d[1].key, to, 0)).toBe(d);
    expect(moveBalance(d, d[1].key, d[0].key, d[0].pockets[0].key, 1)).toBe(d); // ??? holds nothing
  });
});
