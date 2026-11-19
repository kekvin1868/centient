import { describe, expect, it } from 'vitest';
import { limitRows } from './CardLimits';

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
      owed: 800_000,
      limit: 2_000_000,
      left: 1_500_000,
      unset: 1,
    });
  });
});
