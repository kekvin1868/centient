// Pay in's numbers: each month, interest (never the rounding), and installments a late log already passed.
import { describe, expect, it } from 'vitest';
import { eachOf, interestOf } from './planForm';
import { billsGone, withPaid } from './planDates';

describe('pay in', () => {
  it('each month is price ÷ count rounded up until typed', () => {
    expect(eachOf(12_000_000, { count: 18, each: null, paid: 0 })).toBe(666_667);
    expect(eachOf(12_000_000, { count: 12, each: 1_050_000, paid: 0 })).toBe(1_050_000);
  });
  it('interest: what each month adds above the price; the rounding is not interest', () => {
    expect(interestOf(12_000_000, { count: 12, each: 1_050_000, paid: 0 })).toEqual({
      all: 600_000,
      month: 50_000,
    });
    expect(interestOf(12_000_000, { count: 18, each: null, paid: 0 }).all).toBe(0);
  });
  it('a late log: bills closed since the purchase, less the last one (still to pay)', () => {
    // Closes on the 20th; bought 11 Sep, today 25 Nov: Sep, Oct, Nov closed; Nov is still the bill to pay.
    expect(billsGone('2026-09-11', 20, '2026-11-25')).toBe(2);
    expect(billsGone('2026-11-25', 20, '2026-11-25')).toBe(0);
    expect(billsGone('2026-11-19', 20, '2026-11-25')).toBe(0);
    // Typed stays (kept under the count); not typed follows the date.
    expect(
      withPaid({ count: 3, each: null, paid: 5, paidTyped: true }, '2026-09-11', 20, '2026-11-25')
        .paid,
    ).toBe(2);
    expect(withPaid({ count: 6, each: null, paid: 0 }, '2026-09-11', 20, '2026-11-25').paid).toBe(
      2,
    );
  });
});
