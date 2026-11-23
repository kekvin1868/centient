import { describe, expect, it } from 'vitest';
import { limitRows } from './CardLimits';
import { overBy, shownBalance } from './TotalBalance';

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
