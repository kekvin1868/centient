import { describe, expect, it } from 'vitest';
import type { Account } from '../../../../../src/repos/accounts';
import type { Envelope } from '../../../../../src/repos/envelopes';
import {
  accountBalance,
  addAccount,
  addPocket,
  editPocket,
  fromCatalog,
  MAX_ACCOUNTS,
  deletePocket,
  defaultSource,
  setAmount,
  sources,
  removePocket,
  rename,
  toggle,
  type Draft,
} from './draft';

const acc = (id: string, name: string, kind: string): Account => ({
  id,
  name,
  kind,
  provider: null,
  currency_code: 'IDR',
  default_envelope_id: `${id}:main`,
  due_day: null,
  statement_day: null,
  reconciled_at: null,
  archived_at: null,
  kept_until: null,
});
const seed = () =>
  fromCatalog(
    [
      acc('d', 'Dailies', 'EWALLET'),
      acc('m', 'Main Account', 'BANK'),
      acc('x', 'Miscs', 'DEBIT_CARD'),
      acc('f', 'Friends', 'IOU'),
    ],
    [] as Envelope[],
  );

describe('draft', () => {
  it('starts from the seeded everyday accounts, bank first, each with Main', () => {
    const d = seed();
    expect(d.map(a => a.name)).toEqual(['Main Account', 'Dailies', 'Miscs']);
    expect(
      d.every(
        a => a.pockets.length === 1 && a.pockets[0].main && a.pockets[0].id === `${a.id}:main`,
      ),
    ).toBe(true);
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

  /** Dailies (2nd seeded account) set to 2.500.000 with one new pocket. */
  const dailies = () => {
    let d = seed();
    const b = d[1];
    d = editPocket(d, b.key, b.pockets[0].key, { balance: 2_500_000 });
    const r = addPocket(d, b.key);
    return { d: r.draft, k: b.key, main: b.pockets[0].key, pk: r.key };
  };
  const ok = (r: ReturnType<typeof setAmount>) => {
    if (!('draft' in r)) throw new Error('refused');
    return r.draft;
  };

  it('From Balance carves the pocket out of the balance: the account total stays (the Transportation case)', () => {
    const t = dailies();
    const d = ok(setAmount(t.d, t.k, t.pk, 400_000, { kind: 'BALANCE' }));
    expect(d[1].pockets.map(p => p.balance)).toEqual([2_100_000, 400_000]);
    expect(accountBalance(d[1])).toBe(2_500_000);
  });

  it('Additional Budget is new money on top', () => {
    const t = dailies();
    const d = ok(setAmount(t.d, t.k, t.pk, 400_000, { kind: 'BUDGET' }));
    expect(accountBalance(d[1])).toBe(2_900_000);
  });

  it('refuses when the source has less, and says what it has', () => {
    const t = dailies();
    expect(setAmount(t.d, t.k, t.pk, 3_000_000, { kind: 'BALANCE' })).toEqual({
      short: { name: "Dailies' balance", have: 2_500_000 },
    });
  });

  it('raising takes only the extra; lowering and ??? give the difference back to the balance', () => {
    const t = dailies();
    let d = ok(setAmount(t.d, t.k, t.pk, 400_000, { kind: 'BALANCE' }));
    d = ok(setAmount(d, t.k, t.pk, 500_000, { kind: 'BALANCE' }));
    expect(d[1].pockets.map(p => p.balance)).toEqual([2_000_000, 500_000]);
    d = ok(setAmount(d, t.k, t.pk, 300_000, { kind: 'BUDGET' }));
    expect(d[1].pockets.map(p => p.balance)).toEqual([2_200_000, 300_000]);
    d = ok(setAmount(d, t.k, t.pk, null, { kind: 'BALANCE' }));
    expect(d[1].pockets.map(p => p.balance)).toEqual([2_500_000, null]);
  });

  it('From another account: its balance or one of its pockets gives the money', () => {
    const t = dailies();
    const m = t.d[0];
    let d = editPocket(t.d, m.key, m.pockets[0].key, { balance: 5_000_000 });
    const e = addPocket(d, m.key);
    d = editPocket(e.draft, m.key, e.key, { balance: 1_000_000 });
    expect(sources(d, t.k).map(r => [r.name, r.main])).toEqual([
      ['Main Account', true],
      ['Pocket 1', false],
      ['Miscs', true],
    ]);
    d = ok(setAmount(d, t.k, t.pk, 400_000, { kind: 'ACCOUNT', account: m.key, pocket: e.key }));
    expect(d[0].pockets.map(p => p.balance)).toEqual([5_000_000, 600_000]);
    expect(accountBalance(d[1])).toBe(2_900_000);
    // The BALANCE keypad takes from another account too.
    d = ok(
      setAmount(d, t.k, t.main, 3_000_000, {
        kind: 'ACCOUNT',
        account: m.key,
        pocket: m.pockets[0].key,
      }),
    );
    expect(d[0].pockets[0].balance).toBe(4_500_000);
    expect(d[1].pockets[0].balance).toBe(3_000_000);
  });

  it('deleting a pocket: back to balance keeps the total, remove money drops it', () => {
    const t = dailies();
    const d = ok(setAmount(t.d, t.k, t.pk, 400_000, { kind: 'BALANCE' }));
    expect(accountBalance(deletePocket(d, t.k, t.pk, true)[1])).toBe(2_500_000);
    expect(accountBalance(deletePocket(d, t.k, t.pk, false)[1])).toBe(2_100_000);
  });

  it('starts on From Balance, or new money when the balance holds nothing', () => {
    const t = dailies();
    expect(defaultSource(t.d[1], false)).toEqual({ kind: 'BALANCE' });
    expect(defaultSource(t.d[2], false)).toEqual({ kind: 'BUDGET' });
    expect(defaultSource(t.d[1], true)).toEqual({ kind: 'BUDGET' });
  });
});
