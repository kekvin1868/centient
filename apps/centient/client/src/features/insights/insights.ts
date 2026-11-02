// How Insights reads its numbers out loud: period names, the comparison line, category shares and the savings rate.
// Pure; the server works out every boundary and sum.
import { formatMoney } from '../../lib/format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A cycle (month 1-12, named by the month holding most of its days) or a whole year (month null). */
export type Span = { year: number; month: number | null };

/** The period bar's label: "Nov 2026 cycle" or "2026". */
export const periodLabel = (s: Span) => (s.month ? `${MONTHS[s.month - 1].slice(0, 3)} ${s.year} cycle` : String(s.year));

/** How the comparison names the period before: "October" or "2025". */
export const previousName = (s: Span) => (s.month ? MONTHS[s.month - 1] : String(s.year));

/**
 * "Rp402.500 more than October so far" while the period runs (same days), "… less than September" once it ended,
 * "The same as October so far" when equal, and "Nothing to compare with yet" when the period before had no spending.
 */
export function comparisonLine(spending: number, previous: Span & { spending: number; basis: 'SAME_DAYS' | 'FULL' }, currency: string): string {
  if (previous.spending === 0) return 'Nothing to compare with yet';
  const name = previousName(previous);
  const soFar = previous.basis === 'SAME_DAYS' ? ' so far' : '';
  const diff = spending - previous.spending;
  if (diff === 0) return `The same as ${name}${soFar}`;
  return `${formatMoney(Math.abs(diff), currency)} ${diff > 0 ? 'more' : 'less'} than ${name}${soFar}`;
}

/** A category's share of spending as a whole percent; "<1%" when it rounds to 0; null when there is nothing to share. */
export function shareLabel(amount: number, total: number): string | null {
  if (amount <= 0 || total <= 0) return null;
  const pct = Math.round((amount / total) * 100);
  return pct === 0 ? '<1%' : `${pct}%`;
}

/** The savings rate as shown: none without income, a whole percent, or a warning when spending is over income. */
export function savingsView(rate: number | null): { kind: 'none' } | { kind: 'ok' | 'negative'; text: string } {
  if (rate === null) return { kind: 'none' };
  const pct = Math.round(Math.abs(rate));
  return rate < 0 ? { kind: 'negative', text: `−${pct}%` } : { kind: 'ok', text: `${pct}%` };
}
