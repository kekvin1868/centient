// One bill like the bank: the plan's example (limit 20jt, closes on the 20th, pay by the 5th, a 12× phone and a
// dinner), short payments, interest lines and plans added part way.
import { describe, expect, it } from 'vitest';
import {
  billOf,
  cardBills,
  closingOf,
  firstBillFor,
  interestDue,
  principalOf,
  shareOut,
  type BillPlan,
  type CardDay,
} from '../src/domain/cardBill';

const card = { closes: 20, payBy: 5 };
const phone: BillPlan = {
  id: 'p',
  name: 'iPhone',
  count: 12,
  each: 1_000_000,
  price: 12_000_000,
  boughtOn: '2026-11-10',
  firstBill: '2026-11',
  paidBefore: 0,
};
const bought: CardDay[] = [
  { day: '2026-11-10', out: 12_000_000, in: 0 },
  { day: '2026-11-12', out: 500_000, in: 0 },
];

describe('card bill', () => {
  it('bills the slice, never the whole price', () => {
    const r = cardBills(card, bought, [phone], [], '2026-11-21');
    expect(r.bill).toMatchObject({
      month: '2026-11',
      closesOn: '2026-11-20',
      dueOn: '2026-12-05',
      carry: 0,
      spent: 500_000,
      total: 1_500_000,
    });
    expect(r.bill.slices).toEqual([
      { planId: 'p', name: 'iPhone', no: 1, of: 12, amount: 1_000_000, paid: false },
    ]);
    expect(r).toMatchObject({ left: 1_500_000, paidSince: 0, spentSince: 0 });
  });

  it('a bill paid in full: the next asks the next slice only', () => {
    const days = [...bought, { day: '2026-12-01', out: 0, in: 1_500_000 }];
    const r = cardBills(card, days, [phone], [], '2026-12-21');
    expect(r.bills[0].slices[0].paid).toBe(true);
    expect(r.bill).toMatchObject({ month: '2026-12', carry: 0, spent: 0, total: 1_000_000 });
    expect(r.left).toBe(1_000_000);
  });

  it('a short payment covers the slice first and the rest carries over', () => {
    const days = [...bought, { day: '2026-12-01', out: 0, in: 1_200_000 }];
    const nov = cardBills(card, days, [phone], [], '2026-12-02');
    expect(nov.bill.slices[0].paid).toBe(true); // 1.2jt: the 1jt slice first, 200rb on the dinner
    expect(nov.left).toBe(300_000);
    const dec = cardBills(card, days, [phone], [], '2026-12-21');
    expect(dec.bill).toMatchObject({ carry: 300_000, total: 1_300_000 });
  });

  it('paying less than a slice leaves it unpaid', () => {
    const days = [...bought, { day: '2026-12-01', out: 0, in: 700_000 }];
    const r = cardBills(card, days, [phone], [], '2026-12-21');
    expect(r.bills[0].slices[0].paid).toBe(false);
    expect(r.bill).toMatchObject({ carry: 800_000, total: 1_800_000 });
    // Next payment: the old slice first, then the new one.
    const later = cardBills(
      card,
      [...days, { day: '2027-01-02', out: 0, in: 1_300_000 }],
      [phone],
      [],
      '2027-01-03',
    );
    expect(later.bills.map(b => b.slices[0].paid)).toEqual([true, true]);
    expect(later.left).toBe(500_000);
  });

  it('money paid extra pays the next slices', () => {
    const days = [...bought, { day: '2026-12-01', out: 0, in: 2_500_000 }];
    const r = cardBills(card, days, [phone], [], '2026-12-21');
    expect(r.bill).toMatchObject({ carry: -1_000_000, total: 0 });
    expect(r.bill.slices[0].paid).toBe(true);
  });

  it('interest is its own line on the bill, not regular spending', () => {
    const plan = { ...phone, each: 1_050_000 };
    const line = { entryId: 'e', planId: 'p', no: 1, day: '2026-11-20', amount: 50_000 };
    const days = [bought[0], { day: '2026-11-20', out: 50_000, in: 0 }];
    const r = cardBills(card, days, [plan], [line], '2026-11-21');
    expect(r.bill).toMatchObject({ spent: 0, interest: [line], total: 1_050_000 });
  });

  it('what was spent since leaves out a plan bought since', () => {
    const days = [
      ...bought,
      { day: '2026-11-25', out: 3_000_000 },
      { day: '2026-11-26', out: 80_000 },
    ];
    const tv = {
      ...phone,
      id: 'tv',
      count: 6,
      price: 3_000_000,
      each: 500_000,
      boughtOn: '2026-11-25',
      firstBill: '2026-12',
    };
    const r = cardBills(
      card,
      days.map(d => ({ in: 0, ...d })),
      [phone, tv],
      [],
      '2026-11-27',
    );
    expect(r.spentSince).toBe(80_000);
  });

  it('a card with nothing on it has an empty last bill', () => {
    const r = cardBills(card, [], [], [], '2026-11-21');
    expect(r.bills).toHaveLength(1);
    expect(r).toMatchObject({ left: 0, spentSince: 0, bill: { total: 0, month: '2026-11' } });
  });

  it('posts each slice its interest once, when its bill closes', () => {
    const plan = { ...phone, each: 1_050_000 };
    expect(interestDue(plan, 20, '2026-12-21', new Set())).toEqual([
      { no: 1, day: '2026-11-20', amount: 50_000 },
      { no: 2, day: '2026-12-20', amount: 50_000 },
    ]);
    expect(interestDue(plan, 20, '2026-12-21', new Set([1]))).toEqual([
      { no: 2, day: '2026-12-20', amount: 50_000 },
    ]);
    expect(interestDue(phone, 20, '2027-12-21', new Set())).toEqual([]); // 0% plan
  });
});

describe('bill dates', () => {
  it('spending on the closing day is on that bill; the day after on the next', () => {
    expect(billOf('2026-11-20', 20)).toBe('2026-11');
    expect(billOf('2026-11-21', 20)).toBe('2026-12');
    expect(closingOf('2027-02', 31)).toBe('2027-02-28');
    expect(billOf('2027-02-28', 31)).toBe('2027-02');
  });

  it('a plan added with 3 paid puts slice 4 on the next bill', () => {
    const firstBill = firstBillFor('2026-11-21', 20, 3);
    expect(firstBill).toBe('2026-09');
    const plan = { ...phone, boughtOn: '2026-11-21', firstBill, paidBefore: 3 };
    const r = cardBills(
      card,
      [{ day: '2026-11-21', out: 9_000_000, in: 0 }],
      [plan],
      [],
      '2026-12-21',
    );
    expect(r.bill.slices).toMatchObject([{ no: 4, amount: 1_000_000 }]);
    expect(r.bill.total).toBe(1_000_000);
  });

  it('slices add up to the price exactly', () => {
    const parts = [1, 2, 3].map(no => principalOf(1_000_001, 3, no));
    expect(parts.reduce((s, x) => s + x, 0)).toBe(1_000_001);
  });
});

describe('shareOut', () => {
  it('shares a price like the installment, the last share taking the rounding', () => {
    expect(shareOut(1_000_000, [2, 1])).toEqual([666_667, 333_333]);
    expect(shareOut(100, [1, 1, 1])).toEqual([33, 33, 34]);
  });
});
