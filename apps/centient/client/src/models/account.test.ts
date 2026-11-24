import { describe, expect, it } from 'vitest';
import { cantSave, cardMissing, limitRows, overBy, shownBalance } from './account';
import { cardSetUp } from '../../../src/domain/recurring';

const acc = (kind: string, balance: number, credit_limit: number | null) => ({
  kind,
  balance,
  credit_limit,
  currency_code: 'IDR',
});
const idr = (v: number) => v;

describe('limitRows', () => {
  it('reads a card balance as debt: left = limit + balance, used = what is owed', () => {
    const [card] = limitRows([acc('CREDIT_CARD', -1_600_000, 12_000_000)], idr);
    expect(card).toMatchObject({ owed: 1_600_000, limit: 12_000_000, left: 10_400_000 });
  });

  it('adds up a kind, counts the ones without a limit, and leaves your money out', () => {
    const rows = limitRows(
      [
        acc('PAYLATER', -500_000, 2_000_000),
        acc('PAYLATER', -300_000, null),
        acc('BANK', 4_400_000, null),
      ],
      idr,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'PAYLATER',
      count: 2,
      owed: 500_000, // used of the 2jt limit only, so left + used = limit
      limit: 2_000_000,
      left: 1_500_000,
      over: 0,
      unset: 1,
      unsetOwed: 300_000,
    });
  });

  it('a card past its limit counts Rp0 left and its own over, never eating what another card has left', () => {
    const [card] = limitRows(
      [acc('CREDIT_CARD', -12_500_000, 12_000_000), acc('CREDIT_CARD', -400_000, 8_000_000)],
      idr,
    );
    expect(card).toMatchObject({ left: 7_600_000, over: 500_000, owed: 12_900_000 });
  });
});

describe('shownBalance', () => {
  it('shows a capped card as what is left of its limit; anything else as its balance', () => {
    expect(shownBalance(acc('CREDIT_CARD', -1_600_000, 12_000_000))).toBe(10_400_000);
    expect(shownBalance(acc('CREDIT_CARD', -1_600_000, null))).toBe(-1_600_000);
    expect(shownBalance(acc('BANK', 4_400_000, null))).toBe(4_400_000);
  });

  it('past the limit: Rp0 left, and overBy says how far', () => {
    expect(shownBalance(acc('CREDIT_CARD', -12_500_000, 12_000_000))).toBe(0);
    expect(overBy(acc('CREDIT_CARD', -12_500_000, 12_000_000))).toBe(500_000);
    expect(overBy(acc('CREDIT_CARD', -1_600_000, 12_000_000))).toBe(0);
    expect(overBy(acc('PAYLATER', -1_600_000, null))).toBe(0);
  });
});

describe('a card before it saves', () => {
  it('needs its limit, both bill days and no more used than the limit; each screen words it', () => {
    expect(cardMissing({ limit: null, days: [20, 5] })).toBe('limit');
    expect(cardMissing({ limit: 1_000, days: [20, null] })).toBe('days');
    expect(cardMissing({ limit: 1_000, days: [20, 5], used: 2_000 })).toBe('used');
    expect(cardMissing({ limit: 1_000, days: [20, 5], used: 1_000 })).toBeNull();
    expect(cantSave({ name: 'BCA', card: true, limit: null, days: [] })).toBe('Enter the limit');
    expect(cantSave({ name: 'BCA', card: false, limit: null, days: [] })).toBeNull();
    expect(cantSave({ name: ' ', card: false, limit: null, days: [] })).toBe('Enter a name');
  });

  it('is set up once it has its limit and both bill days (the same test as the server)', () => {
    const card = { kind: 'CREDIT_CARD', credit_limit: 1_000, statement_day: 20, due_day: 5 };
    expect(cardSetUp(card)).toBe(true);
    expect(cardSetUp({ ...card, due_day: null })).toBe(false);
    expect(cardSetUp({ ...card, kind: 'BANK' })).toBe(false);
  });
});
