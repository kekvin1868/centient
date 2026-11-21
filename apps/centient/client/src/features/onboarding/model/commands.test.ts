import { describe, expect, it } from 'vitest';
import type { Account } from '../../../../../src/repos/accounts';
import type { Envelope } from '../../../../../src/repos/envelopes';
import { toSteps } from './commands';
import {
  addAccount,
  addPocket,
  cardsUnset,
  editPocket,
  fromCatalog,
  rename,
  setCard,
  setKind,
  toggle,
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
  credit_limit: null,
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

describe('toSteps', () => {
  it('deletes first, then patches, creates, balances, one allocation batch and finish', () => {
    let d = seed();
    d = toggle(d, d[2].key); // drop Miscs
    d = rename(d, d[0].key, 'BCA');
    const n = addAccount(d)!;
    d = n.draft;
    const p = addPocket(d, d[0].key);
    d = editPocket(p.draft, d[0].key, p.key, { name: 'Rent', balance: 300 });
    d = editPocket(d, d[0].key, d[0].pockets[0].key, { balance: 700 });
    const steps = toSteps(d);
    expect(steps.map(s => s.op)).toEqual([
      'deleteAccount',
      'patchAccount',
      'patchAccount',
      'createAccount',
      'createPocket',
      'setBalance',
      'allocate',
      'finish',
    ]);
    expect(steps[1]).toMatchObject({ accountId: 'm', json: { name: 'BCA', kind: 'BANK' } });
    expect(steps.find(s => s.op === 'setBalance')).toMatchObject({ actual: 1000 });
    expect(steps.find(s => s.op === 'allocate')).toMatchObject({
      moves: [{ pocketKey: p.key, amount: 300 }],
    });
    expect(new Set(steps.map(s => s.id)).size).toBe(steps.length);
  });

  it('records what a card owes as a negative balance', () => {
    let d = seed();
    d = d.map((a, i) => (i === 0 ? { ...a, kind: 'CREDIT_CARD' } : a));
    d = editPocket(d, d[0].key, d[0].pockets[0].key, { balance: 500 });
    expect(toSteps(d).find(s => s.op === 'setBalance')).toMatchObject({ actual: -500 });
  });

  it('sends a card its limit and bill days, and waits for them before confirming', () => {
    let d = seed();
    d = setKind(d, d[0].key, 'PAYLATER'); // a seeded account turned into pay later
    const n = addAccount(d)!;
    d = setKind(n.draft, n.key, 'CREDIT_CARD'); // a new card
    expect(cardsUnset(d).map(a => a.key)).toEqual([d[0].key, n.key]);
    d = setCard(d, d[0].key, { limit: 21_000_000, closes: 31, payBy: 5 });
    d = setCard(d, n.key, { limit: 12_000_000, closes: 20, payBy: null });
    expect(cardsUnset(d).map(a => a.key)).toEqual([n.key]);
    d = setCard(d, n.key, {
      limit: 12_000_000,
      closes: 20,
      payBy: 5,
      billed: 1_000_000,
      since: 600_000,
    });
    expect(cardsUnset(d)).toEqual([]);
    // Used = last bill + since, a debt; the last bill's part is sent apart so it lands on that bill.
    expect(d.find(a => a.key === n.key)!.pockets[0].balance).toBe(1_600_000);
    const steps = toSteps(d);
    expect(steps.find(s => s.op === 'patchAccount' && s.accountId === 'm')).toMatchObject({
      json: { kind: 'PAYLATER', credit_limit: 21_000_000, statement_day: 31, due_day: 5 },
    });
    expect(steps.find(s => s.op === 'createAccount')).toMatchObject({
      kind: 'CREDIT_CARD',
      card: { creditLimit: 12_000_000, statementDay: 20, dueDay: 5 },
    });
    expect(steps.find(s => s.op === 'setBalance' && s.accountKey === n.key)).toMatchObject({
      actual: -1_600_000,
      billed: 1_000_000,
    });
  });

  it('a card has no pockets: turning an account into one drops them and starts the balance over', () => {
    let d = seed();
    const p = addPocket(d, d[0].key);
    d = editPocket(p.draft, d[0].key, p.key, { name: 'Rent', balance: 300 });
    d = editPocket(d, d[0].key, d[0].pockets[0].key, { balance: 700 });
    const card = setKind(d, d[0].key, 'CREDIT_CARD');
    expect(card[0].pockets.map(x => [x.main, x.balance])).toEqual([[true, null]]);
    expect(setKind(card, d[0].key, 'BANK')[0].pockets[0].balance).toBeNull();
    expect(setKind(d, d[0].key, 'EWALLET')[0].pockets).toHaveLength(2); // bank to e-wallet keeps them
  });
});
