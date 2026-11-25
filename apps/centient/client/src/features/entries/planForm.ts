// "Pay in" on the receipt: a purchase on a card or pay later paid in installments. Pure numbers for the form:
// what each month is until typed and the interest it carries. Quick add (Home's first paint) reads this, so it
// imports nothing; the late-log date maths is ./planDates, loaded with the receipt.

/**
 * The plan on the form: `each` null = price ÷ count (rounded up); `paid` = installments already gone (logged late),
 * kept in step with the date, count and card (`withPaid`) until typed (`paidTyped`).
 */
export type PlanForm = { count: number; each: number | null; paid: number; paidTyped?: boolean };

/** The counts with a key of their own; any other count is typed on OTHER's stepper. */
export const COUNTS = [3, 6, 12, 24];
/** What OTHER starts at: 18× is the common count without a key (Tokopedia, Mandiri). */
export const OTHER_START = 18;

export const eachOf = (amount: number, p: PlanForm) => p.each ?? Math.ceil(amount / p.count);

/** What the plan costs above the price, in all and a month (0 = a 0% plan). */
export function interestOf(amount: number, p: PlanForm) {
  const over = eachOf(amount, p) * p.count - amount;
  // Under a rupiah a month is the rounding up of price ÷ count (12jt over 18 = 666.667), not interest.
  const all = over < p.count ? 0 : over;
  return { all, month: Math.round(all / p.count) };
}
