// What waiting changes look like on the phone: rows, balances, budget spending and stand-in tabs, built with the
// server's own rule code.
import { describe, expect, it } from 'vitest';
import type { Command } from '../../../src/lib/schemas';
import type { OutboxItem, SavedEntry } from './outbox';
import { check, leavesPaybacksOver, overlay } from './waiting';
import type { Catalog } from './workspace';

const account = (id: string, kind = 'BANK', currency = 'IDR') => ({
  id,
  name: id,
  kind,
  currency_code: currency,
  default_envelope_id: `${id}:main`,
  archived_at: null,
});
const pocket = (id: string, accountId: string, currency = 'IDR') => ({
  id,
  account_id: accountId,
  name: id,
  kind: 'SPENDING',
  currency_code: currency,
  archived_at: null,
});
const cat = {
  accounts: [account('bca'), account('gopay', 'EWALLET'), account('Budi', 'IOU')],
  envelopes: [
    pocket('bca:main', 'bca'),
    pocket('jajan', 'bca'),
    pocket('gopay:main', 'gopay'),
    pocket('Budi:main', 'Budi'),
  ],
  categories: [
    { id: 'food', name: 'Food & Drink', kind: 'EXPENSE', archived_at: null },
    { id: 'salary', name: 'Salary', kind: 'INCOME', archived_at: null },
    { id: 'fees', name: 'Fees', kind: 'EXPENSE', archived_at: null },
  ],
} as unknown as Catalog;

const kopi = (
  amount = 25_000,
  more: Partial<Extract<Command, { type: 'EXPENSE' }>> = {},
): Command => ({
  type: 'EXPENSE',
  accountId: 'bca',
  categoryId: 'food',
  amount,
  date: '2026-11-13',
  merchant: 'kopi',
  ...more,
});
let n = 0;
const item = (o: Partial<OutboxItem> & Pick<OutboxItem, 'op'>): OutboxItem => ({
  key: `k${++n}`,
  entryId: `e${n}`,
  at: Date.parse('2026-11-13T03:00:00Z'),
  state: 'waiting',
  ...o,
});
/** An entry as the server would send it: the overlay's own view of a new one, stripped of its mark. */
function savedFrom(command: Command, id: string, version = 1): SavedEntry {
  const [e] = overlay([item({ op: 'create', entryId: id, command })], cat).entries;
  const { waiting: _, ...entry } = e;
  return { ...entry, version };
}

describe('a waiting new entry', () => {
  it('shows as a row and moves its account, its pocket and budget spending', () => {
    const o = overlay(
      [item({ op: 'create', entryId: 'a', command: kopi(25_000, { envelopeId: 'jajan' }) })],
      cat,
    );
    expect(o.entries).toHaveLength(1);
    expect(o.entries[0]).toMatchObject({
      id: 'a',
      kind: 'USER',
      waiting: { state: 'waiting', op: 'create', held: false },
      transactions: [
        { type: 'EXPENSE', merchant: 'kopi', entries: [{ account_id: 'bca', amount: -25_000 }] },
      ],
    });
    expect(o.entries[0].occurred_at.slice(0, 10)).toBe('2026-11-13');
    expect(o.accounts).toEqual({ bca: -25_000 });
    expect(o.envelopes).toEqual({ jajan: -25_000 });
    expect(o.spending).toEqual([
      { categoryId: 'food', envelopeId: 'jajan', amount: 25_000, day: '2026-11-13' },
    ]);
    expect(o).toMatchObject({ count: 1, problems: 0 });
  });

  it('income adds, a transfer with a fee moves and spends the fee', () => {
    const o = overlay(
      [
        item({
          op: 'create',
          command: {
            type: 'INCOME',
            accountId: 'bca',
            categoryId: 'salary',
            amount: 1_000_000,
            date: '2026-11-13',
          },
        }),
        item({
          op: 'create',
          command: {
            type: 'TRANSFER',
            fromAccountId: 'bca',
            toAccountId: 'gopay',
            amount: 100_000,
            fee: 2_500,
            date: '2026-11-13',
          },
        }),
      ],
      cat,
    );
    expect(o.accounts).toEqual({ bca: 1_000_000 - 100_000 - 2_500, gopay: 100_000 });
    expect(o.spending).toEqual([
      { categoryId: 'fees', envelopeId: 'bca:main', amount: 2_500, day: '2026-11-13' },
    ]);
  });

  it('a refused one keeps its row, marked, and counts for nothing', () => {
    const o = overlay(
      [item({ op: 'create', command: kopi(), state: 'refused', reason: 'Pocket not found' })],
      cat,
    );
    expect(o.entries[0].waiting).toMatchObject({ state: 'refused', reason: 'Pocket not found' });
    expect(o.accounts).toEqual({});
    expect(o).toMatchObject({ count: 0, problems: 1 });
  });
});

describe('a waiting edit or delete of a saved entry', () => {
  const saved = savedFrom(kopi(25_000), 'a', 4);

  it('an edit shows the new values, keeps the time, and counts only the difference', () => {
    const o = overlay(
      [item({ op: 'edit', entryId: 'a', command: kopi(30_000), saved, base: 4 })],
      cat,
    );
    expect(o.entries[0]).toMatchObject({ id: 'a', version: 4, waiting: { op: 'edit' } });
    expect(o.entries[0].occurred_at).toBe(saved.occurred_at);
    expect(o.accounts).toEqual({ bca: -5_000 });
    expect(o.spending.reduce((s, x) => s + x.amount, 0)).toBe(5_000);
  });

  it('an edit that moves the entry to another account moves the money', () => {
    const o = overlay(
      [item({ op: 'edit', entryId: 'a', command: kopi(25_000, { accountId: 'gopay' }), saved })],
      cat,
    );
    expect(o.accounts).toEqual({ gopay: -25_000, bca: 25_000 });
  });

  it('a delete hides the entry and gives its money back', () => {
    const o = overlay([item({ op: 'remove', entryId: 'a', saved })], cat);
    expect(o.entries).toEqual([]);
    expect([...o.removed]).toEqual(['a']);
    expect(o.accounts).toEqual({ bca: 25_000 });
  });

  it('a refused delete leaves the entry in place, marked', () => {
    const o = overlay([item({ op: 'remove', entryId: 'a', saved, state: 'refused' })], cat);
    expect(o.removed.size).toBe(0);
    expect(o.entries[0]).toMatchObject({ id: 'a', waiting: { state: 'refused', op: 'remove' } });
    expect(o.accounts).toEqual({ bca: 0 });
  });

  it('a new entry on its way with an edit behind it counts once, with the edit', () => {
    const o = overlay(
      [
        item({ op: 'create', entryId: 'n', command: kopi(25_000), state: 'sending' }),
        item({ op: 'edit', entryId: 'n', command: kopi(40_000) }),
      ],
      cat,
    );
    expect(o.entries).toHaveLength(1);
    expect(o.accounts).toEqual({ bca: -40_000 });
  });
});

describe('split bills', () => {
  const dinner = (parties: { name?: string; iouAccountId?: string; share: number }[]): Command =>
    kopi(90_000, { merchant: 'dinner', split: { people: parties.length + 1, parties } });

  it('uses the tab the phone knows, and a stand-in for a new name', () => {
    const o = overlay(
      [
        item({
          op: 'create',
          entryId: 'b',
          command: dinner([
            { name: 'budi', share: 30_000 },
            { name: 'Andi', share: 30_000 },
          ]),
        }),
      ],
      cat,
    );
    expect(o.tabs).toEqual([
      { id: 'waiting:IDR:Andi', name: 'Andi', currency: 'IDR', balance: 30_000 },
    ]);
    expect(o.accounts).toMatchObject({ bca: -90_000, Budi: 30_000, 'waiting:IDR:Andi': 30_000 });
    // My share is the spending; the rest is owed.
    expect(o.spending).toEqual([
      { categoryId: 'food', envelopeId: 'bca:main', amount: 30_000, day: '2026-11-13' },
    ]);
    expect(o.entries[0].people).toEqual([
      { tabId: 'Budi', share: 30_000, paid: 0, paybacks: [] },
      { tabId: 'waiting:IDR:Andi', share: 30_000, paid: 0, paybacks: [] },
    ]);
    // What is sent still names the people; the server finds or makes their tabs.
    expect(o.entries[0].command).toMatchObject({
      split: { parties: [{ name: 'budi' }, { name: 'Andi' }] },
    });
  });

  it('one stand-in per person across bills, whatever the case typed', () => {
    const o = overlay(
      [
        item({ op: 'create', command: dinner([{ name: 'Andi', share: 30_000 }]) }),
        item({ op: 'create', command: dinner([{ name: 'andi', share: 45_000 }]) }),
      ],
      cat,
    );
    expect(o.tabs).toEqual([
      { id: 'waiting:IDR:Andi', name: 'Andi', currency: 'IDR', balance: 75_000 },
    ]);
  });

  it('an unnamed split goes to a Friends stand-in when there is no Friends tab', () => {
    const o = overlay(
      [item({ op: 'create', command: kopi(90_000, { split: { people: 3 } }) })],
      cat,
    );
    expect(o.tabs).toEqual([
      { id: 'waiting:IDR:Friends', name: 'Friends', currency: 'IDR', balance: 60_000 },
    ]);
  });
});

describe('checked on the phone before it is queued', () => {
  it('passes what the server would take', () => {
    expect(() => check(kopi(), cat, Date.now())).not.toThrow();
  });
  it('refuses what the server would refuse', () => {
    expect(() => check(kopi(25_000, { envelopeId: 'gopay:main' }), cat, 0)).toThrow(
      /another account/,
    );
    expect(() => check(kopi(25_000, { categoryId: 'salary' }), cat, 0)).toThrow(/income category/);
    expect(() =>
      check(
        kopi(90_000, { split: { people: 2, parties: [{ name: 'Andi', share: 90_000 }] } }),
        cat,
        0,
      ),
    ).toThrow(/more than zero/);
  });
});

describe('a bill edited under its Paid backs', () => {
  const bill = {
    id: 'b',
    people: [
      {
        tabId: 'Budi',
        share: 30_000,
        paid: 30_000,
        paybacks: [{ entryId: 'p', amount: 30_000, date: '2026-11-12' }],
      },
    ],
  };
  const withShare = (share: number): Command =>
    kopi(90_000, { split: { people: 2, parties: [{ iouAccountId: 'Budi', share }] } });

  it('asks only when a share drops below what was paid back', () => {
    expect(leavesPaybacksOver(bill, withShare(30_000), cat, 0)).toBe(false);
    expect(leavesPaybacksOver(bill, withShare(45_000), cat, 0)).toBe(false);
    expect(leavesPaybacksOver(bill, withShare(20_000), cat, 0)).toBe(true);
    expect(leavesPaybacksOver({ id: 'b', people: null }, withShare(1), cat, 0)).toBe(false);
  });
});
