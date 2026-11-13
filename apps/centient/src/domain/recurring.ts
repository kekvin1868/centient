// Recurring bills: when they fall due, what they cost per month and year, which saved expense pays one, a
// credit card's statement dates, and spotting a monthly bill in past payments. Pure; dates are YYYY-MM-DD.
import { addMonths } from './cycle';
import { daysBetween } from './forecast';

export type Schedule = {
  nextDue: string;
  dueDay: number;
  everyMonths: number;
  endsOn: string | null;
};

/** The due date after `nextDue`; null when that would pass `endsOn` (the bill is over). */
export function dueAfter(s: Schedule): string | null {
  const next = addMonths(s.nextDue, s.everyMonths, s.dueDay);
  return s.endsOn && next > s.endsOn ? null : next;
}

/** Every due date from `nextDue` through `until`, stopping at `endsOn`. */
export function dueDates(s: Schedule, until: string): string[] {
  const out: string[] = [];
  for (let d: string | null = s.nextDue; d && d <= until; d = dueAfter({ ...s, nextDue: d }))
    if (!s.endsOn || d <= s.endsOn) out.push(d);
  return out;
}

/** What a bill of `amount` every `everyMonths` months costs. `everyMonths` is 1, 3, 6 or 12, so a year is exact. */
export const costOf = (amount: number, everyMonths: number) => ({
  perMonth: Math.round(amount / everyMonths),
  perYear: (amount * 12) / everyMonths,
});

type Payable = {
  accountId: string;
  amount: number | null;
  name: string;
  service: string | null;
  nextDue: string;
};
type Expense = { accountId: string; amount: number; date: string; merchant?: string };

// A payment counts from 10 days before the due date to 20 days after; later than that the owner marks it paid.
const EARLY = 10;
const LATE = 20;

/**
 * Does this saved expense pay the bill? Same account, near the due date, and either the bill's amount (with no
 * merchant, or the bill's own name) or, for a bill whose amount varies, the bill's name as the merchant.
 */
export function pays(bill: Payable, e: Expense): boolean {
  const gap = daysBetween(bill.nextDue, e.date);
  if (e.accountId !== bill.accountId || gap < -EARLY || gap > LATE) return false;
  const merchant = e.merchant?.trim().toLowerCase() ?? '';
  const named = [bill.name.trim().toLowerCase(), bill.service].some(n => n && merchant === n);
  return bill.amount === null ? named : e.amount === bill.amount && (!merchant || named);
}

/**
 * A card's statement on `today`: the last cut-off (its statement day, on or before today) and the day that
 * bill is due (the first due day after the cut-off; null when the card has no due day).
 */
export function statementOf(statementDay: number, dueDay: number | null, today: string) {
  const thisMonth = addMonths(today, 0, statementDay);
  const cutOff = thisMonth <= today ? thisMonth : addMonths(today, -1, statementDay);
  if (dueDay === null) return { cutOff, dueOn: null };
  const sameMonth = addMonths(cutOff, 0, dueDay);
  return { cutOff, dueOn: sameMonth > cutOff ? sameMonth : addMonths(cutOff, 1, dueDay) };
}

/**
 * Payments to one merchant, oldest first, that look like a monthly bill: two or more, each a month after the
 * one before (give or take 5 days), each within 10% of the latest amount.
 */
export function looksMonthly(payments: { day: string; amount: number }[]): boolean {
  const latest = payments.at(-1)?.amount ?? 0;
  return (
    payments.length >= 2 &&
    payments.every(p => Math.abs(p.amount - latest) <= latest * 0.1) &&
    payments.slice(1).every((p, i) => {
      const gap = daysBetween(payments[i].day, p.day);
      return gap >= 25 && gap <= 36;
    })
  );
}
