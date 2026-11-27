// A late log (the receipt's date before the card's last closings): how many installments already passed. Loaded
// with the receipt, not Home: it needs the card bill engine's month maths.
import { billOf, closingOf, nextMonth } from '../../../../src/domain/cardBill';
import type { PlanForm } from './planForm';

/**
 * Installments a purchase made on `day` already passed by `today`: one per bill closed since, less the last
 * closed one (it is still the bill to pay, so its installment stays on it). 0 for a purchase since that closing.
 */
export function billsGone(day: string, closes: number, today: string) {
  let n = 0;
  for (let m = billOf(day, closes); closingOf(m, closes) <= today; m = nextMonth(m)) n++;
  return Math.max(0, n - 1);
}

/** The plan with `paid` worked out again for this date and card, unless it was typed. */
export const withPaid = (
  p: PlanForm,
  day: string,
  closes: number | null,
  today: string,
): PlanForm =>
  p.paidTyped
    ? { ...p, paid: Math.min(p.paid, p.count - 1) }
    : { ...p, paid: closes ? Math.min(billsGone(day, closes, today), p.count - 1) : 0 };
