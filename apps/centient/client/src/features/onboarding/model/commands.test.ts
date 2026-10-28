import { describe, expect, it } from 'vitest';
import type { Account } from '../../../../../src/repos/accounts';
import type { Envelope } from '../../../../../src/repos/envelopes';
import { toSteps } from './commands';
import { addAccount, addPocket, editPocket, fromCatalog, rename, toggle } from './draft';

const acc = (id: string, name: string, kind: string): Account =>
  ({ id, name, kind, provider: null, currency_code: 'IDR', default_envelope_id: `${id}:main`, due_day: null, reconciled_at: null, archived_at: null });
const seed = () => fromCatalog(
  [acc('d', 'Dailies', 'EWALLET'), acc('m', 'Main Account', 'BANK'), acc('x', 'Miscs', 'DEBIT_CARD'), acc('f', 'Friends', 'IOU')],
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
    expect(steps.map(s => s.op)).toEqual(['deleteAccount', 'patchAccount', 'patchAccount', 'createAccount', 'createPocket', 'setBalance', 'allocate', 'finish']);
    expect(steps[1]).toMatchObject({ accountId: 'm', json: { name: 'BCA', kind: 'BANK' } });
    expect(steps.find(s => s.op === 'setBalance')).toMatchObject({ actual: 1000 });
    expect(steps.find(s => s.op === 'allocate')).toMatchObject({ moves: [{ pocketKey: p.key, amount: 300 }] });
    expect(new Set(steps.map(s => s.id)).size).toBe(steps.length);
  });

  it('records what a card owes as a negative balance', () => {
    let d = seed();
    d = d.map((a, i) => (i === 0 ? { ...a, kind: 'CREDIT_CARD' } : a));
    d = editPocket(d, d[0].key, d[0].pockets[0].key, { balance: 500 });
    expect(toSteps(d).find(s => s.op === 'setBalance')).toMatchObject({ actual: -500 });
  });
});
