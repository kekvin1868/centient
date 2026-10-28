import { describe, expect, it } from 'vitest';
import type { Account } from '../../../../../src/repos/accounts';
import type { Envelope } from '../../../../../src/repos/envelopes';
import { accountBalance, addAccount, addPocket, editPocket, fromCatalog, MAX_ACCOUNTS, removePocket, rename, toggle, type Draft } from './draft';

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
});
