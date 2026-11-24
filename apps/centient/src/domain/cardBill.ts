// A credit card's or pay later's bills, the way the bank prints them. Each month the card closes on its closing
// day; everything since the last closing lands on that bill: regular spending, this month's slice of each
// installment plan (never the plan's whole price, which only blocks the limit), and interest lines. What was not
// paid of a bill carries over as the first line of the next. Payments cover slices first, oldest first, then the
// rest; a slice is paid once payments cover it whole. Pure: day sums, plans and interest lines in, bills out.
import { addMonths } from './cycle';
import { statementOf } from './recurring';

/** A bill is known by the month it closes in: YYYY-MM. */
export type Month = string;

/** The card's money on one day: `out` = spent (purchases, interest, fees), `in` = paid back or credited. */
export type CardDay = { day: string; out: number; in: number };

export type BillPlan = {
  id: string;
  name: string;
  count: number;
  /** What the bank asks each month: the slice plus its interest. */
  each: number;
  /** What the limit blocks: the price, without interest. */
  price: number;
  /** The day the price went on the card. */
  boughtOn: string;
  /** The bill slice 1 rides on; "Move to next bill" adds one. */
  firstBill: Month;
  /** Slices paid before the plan was added: they rode older bills, outside the app. */
  paidBefore: number;
};

/**
 * An interest line already posted: an EXPENSE entry on the card. From a plan's slice (planId + no, the daily job),
 * or typed by hand from the statement: on an older bill's unpaid part (`from`, its month) or on a plan (planId).
 */
export type InterestLine = {
  entryId: string;
  planId: string | null;
  no: number | null;
  from: Month | null;
  day: string;
  amount: number;
};

export type Slice = { planId: string; name: string; no: number; of: number; amount: number };

export type Bill = {
  month: Month;
  closesOn: string;
  dueOn: string | null;
  /** Unpaid (+) or paid extra (−) from the bill before, after what was paid before this one closed. */
  carry: number;
  /** Regular spending since the bill before: no plan prices, no interest. */
  spent: number;
  slices: (Slice & { paid: boolean })[];
  interest: InterestLine[];
  /** What the bill asks: carry + spent + slices + interest. Below zero = the card is in credit. */
  total: number;
};

const ym = (m: Month) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
export const nextMonth = (m: Month, k = 1): Month => addMonths(`${m}-01`, k).slice(0, 7);
export const monthsFrom = (a: Month, b: Month) => ym(b) - ym(a);
/** Bill `m`'s closing date: its closing day, the month's last day when the month is shorter. */
export const closingOf = (m: Month, closes: number) => addMonths(`${m}-01`, 0, closes);

/** The bill a day's spending lands on: the first one closing on or after it. */
export function billOf(day: string, closes: number): Month {
  const m = day.slice(0, 7);
  return day <= closingOf(m, closes) ? m : nextMonth(m);
}

/** Slice `no` (1-based) without interest: the price shared out so the slices add up to it exactly. */
export const principalOf = (price: number, count: number, no: number) =>
  Math.floor((price * no) / count) - Math.floor((price * (no - 1)) / count);

/** Interest in slice `no`: what the bank asks each month less the slice's share of the price. */
export const interestOf = (p: Pick<BillPlan, 'each' | 'price' | 'count'>, no: number) =>
  p.each - principalOf(p.price, p.count, no);

/** The price still owed when the plan was added: the slices after the ones paid before. */
export const priceLeft = (p: Pick<BillPlan, 'price' | 'count' | 'paidBefore'>) =>
  p.price - Math.floor((p.price * p.paidBefore) / p.count);

/** `total` shared out in proportion to `shares` (whole numbers); the last share takes the rounding. */
export function shareOut(total: number, shares: number[]) {
  const whole = shares.reduce((a, b) => a + b, 0);
  const parts = shares.map(x => Math.round((x * total) / whole));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/** The bill slice `no` rides on. */
export const sliceBill = (p: Pick<BillPlan, 'firstBill'>, no: number) =>
  nextMonth(p.firstBill, no - 1);

/** Where slice 1 goes for a plan added on `day` with `paidBefore` slices paid: the next unpaid one is on the next bill. */
export const firstBillFor = (day: string, closes: number, paidBefore: number) =>
  nextMonth(billOf(day, closes), -paidBefore);

/** The slices of `plans` riding bill `m`. */
function slicesOn(plans: BillPlan[], m: Month): Slice[] {
  return plans.flatMap(p => {
    const no = monthsFrom(p.firstBill, m) + 1;
    return no > p.paidBefore && no <= p.count
      ? [{ planId: p.id, name: p.name, no, of: p.count, amount: principalOf(p.price, p.count, no) }]
      : [];
  });
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/**
 * Every bill of a card from its first spending through the last one closed by `today`, oldest first, plus the
 * open period after it: what was paid toward that last bill, what is left of it, and what was spent since
 * (regular spending only; a plan bought since rides later bills as slices).
 */
export function cardBills(
  card: { closes: number; payBy: number | null },
  days: CardDay[],
  plans: BillPlan[],
  interest: InterestLine[],
  today: string,
) {
  const { cutOff } = statementOf(card.closes, card.payBy, today);
  const last = cutOff.slice(0, 7);
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const first = sorted.length ? billOf(sorted[0].day, card.closes) : last;
  const within = (from: string, to: string | null) => (d: { day: string }) =>
    d.day > from && (to === null || d.day <= to);

  // What is still unpaid: slices oldest first, then everything else (below zero = credit).
  const queue: { slice: Slice & { paid: boolean }; left: number }[] = [];
  let other = 0;
  const pay = (amount: number) => {
    for (const q of queue) {
      const take = Math.min(q.left, amount);
      q.left -= take;
      amount -= take;
    }
    other -= amount;
  };
  /** Regular spending in a period: all money out less the interest lines and the prices of plans bought in it. */
  const regular = (inPeriod: (d: { day: string }) => boolean) =>
    sum(sorted.filter(inPeriod).map(d => d.out)) -
    sum(interest.filter(inPeriod).map(i => i.amount)) -
    sum(plans.filter(p => inPeriod({ day: p.boughtOn })).map(priceLeft));

  const bills: Bill[] = [];
  for (let m = monthsFrom(first, last) > 0 ? first : last; ym(m) <= ym(last); m = nextMonth(m)) {
    const closesOn = closingOf(m, card.closes);
    const inPeriod = within(closingOf(nextMonth(m, -1), card.closes), closesOn);
    pay(sum(sorted.filter(inPeriod).map(d => d.in)));
    const carry = sum(queue.map(q => q.left)) + other;
    const slices = slicesOn(plans, m).map(s => ({ ...s, paid: false }));
    queue.push(...slices.map(slice => ({ slice, left: slice.amount })));
    // Money paid extra pays the new slices first.
    if (other < 0) {
      const credit = -other;
      other = 0;
      pay(credit);
    }
    const lines = interest.filter(inPeriod);
    const spent = regular(inPeriod);
    other += spent + sum(lines.map(i => i.amount));
    bills.push({
      month: m,
      closesOn,
      dueOn: statementOf(card.closes, card.payBy, closesOn).dueOn,
      carry,
      spent,
      slices,
      interest: lines,
      total: carry + spent + sum(slices.map(s => s.amount)) + sum(lines.map(i => i.amount)),
    });
  }

  const since = within(cutOff, null);
  const paidSince = sum(sorted.filter(since).map(d => d.in));
  pay(paidSince);
  for (const q of queue) q.slice.paid = q.left === 0;
  const bill = bills.at(-1)!;
  return {
    bills,
    bill,
    paidSince,
    left: Math.max(0, bill.total - paidSince),
    spentSince: regular(since),
  };
}

export type CardBills = ReturnType<typeof cardBills>;

/** The slices a card's bills paid, as "planId:no". */
export const paidSlices = (r: CardBills) =>
  r.bills.flatMap(b => b.slices.filter(s => s.paid).map(s => `${s.planId}:${s.no}`));

/**
 * Where interest typed from the last bill's statement may come from: the unpaid part of the bill before (only
 * when some of it carried over), or a plan of this card with a slice still unpaid. Nothing on a card's first
 * bill: nothing was unpaid before it. The card statement offers these; "Log interest" refuses anything else.
 */
export function interestSources(
  r: CardBills,
  plans: BillPlan[],
): { month: Month | null; plans: { id: string; name: string }[] } {
  if (r.bills.length < 2) return { month: null, plans: [] };
  const paid = new Set(paidSlices(r));
  const open = (p: BillPlan) => {
    for (let no = p.paidBefore + 1; no <= p.count; no++)
      if (!paid.has(`${p.id}:${no}`)) return true;
    return false;
  };
  return {
    month: r.bill.carry > 0 ? r.bills.at(-2)!.month : null,
    plans: plans.filter(open).map(p => ({ id: p.id, name: p.name })),
  };
}

/** Interest lines a plan owes by `today` that are not posted yet: one per slice whose bill has closed. */
export function interestDue(p: BillPlan, closes: number, today: string, posted: Set<number>) {
  const out: { no: number; day: string; amount: number }[] = [];
  for (let no = p.paidBefore + 1; no <= p.count; no++) {
    const day = closingOf(sliceBill(p, no), closes);
    if (day > today) break;
    const amount = interestOf(p, no);
    if (amount > 0 && !posted.has(no)) out.push({ no, day, amount });
  }
  return out;
}
