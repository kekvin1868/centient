// How Insights reads its numbers out loud: period names, the comparison line, category shares and the savings rate.
// Pure; the server works out every boundary and sum.
import { formatMoney } from '../../lib/format';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A cycle (month 1-12, named by the month holding most of its days) or a whole year (month null). */
export type Span = { year: number; month: number | null };

/** An export's file name: `centient-2026-11-IDR.pdf`, `centient-2026-11-all.csv`, year view `centient-2026-IDR.csv` (R7.6). */
export const exportName = (s: Span, currency: string | null, ext: 'pdf' | 'csv') =>
  `centient-${s.year}${s.month ? `-${String(s.month).padStart(2, '0')}` : ''}-${currency ?? 'all'}.${ext}`;

/** The period bar's label: "Nov 2026 cycle" or "2026". */
export const periodLabel = (s: Span) =>
  s.month ? `${MONTHS[s.month - 1].slice(0, 3)} ${s.year} cycle` : String(s.year);

/** How the comparison names the period before: "October" or "2025". */
export const previousName = (s: Span) => (s.month ? MONTHS[s.month - 1] : String(s.year));

/**
 * "Rp402.500 more than October so far" while the period runs (same days), "… less than September" once it ended,
 * "The same as October so far" when equal, and "Nothing to compare with yet" when the period before had no spending.
 */
export function comparisonLine(
  spending: number,
  previous: Span & { spending: number; basis: 'SAME_DAYS' | 'FULL' },
  currency: string,
): string {
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
export function savingsView(
  rate: number | null,
): { kind: 'none' } | { kind: 'ok' | 'negative'; text: string } {
  if (rate === null) return { kind: 'none' };
  const pct = Math.round(Math.abs(rate));
  return rate < 0 ? { kind: 'negative', text: `−${pct}%` } : { kind: 'ok', text: `${pct}%` };
}

// ---- Step 5: the trend, Daily average spendings, Budgets over time and the counted amounts in a list ----

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayName = (day: string) =>
  new Date(Date.parse(day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const short = (month: number) => MONTHS[month - 1].slice(0, 3);

type Bar = { key: string; axis: string; name: string; value: number | null; shown: string };

/** One bar per day (labelled on the 1st and every 5th) or per cycle of the year (labelled Jan to Dec). */
export function trendBars(
  trend: { from: string; month?: number; amount: number | null }[],
  year: number,
  currency: string,
): Bar[] {
  return trend.map((t, n) => {
    const shown = t.amount === null ? '' : formatMoney(t.amount, currency);
    if (t.month)
      return {
        key: t.from,
        axis: short(t.month),
        name: `${short(t.month)} ${year}`,
        value: t.amount,
        shown,
      };
    const d = n + 1;
    return {
      key: t.from,
      axis: d === 1 || d % 5 === 0 ? String(d) : '',
      name: dayName(t.from),
      value: t.amount,
      shown,
    };
  });
}

type Weekday = { total: number; occurrences: number; average: number | null };

/** Monday to Sunday by the average; a weekday that has not come round yet is an empty slot. */
export const weekdayBars = (rows: Weekday[], currency: string): (Bar & Weekday)[] =>
  rows.map((r, n) => ({
    ...r,
    key: WEEKDAYS[n],
    axis: WEEKDAYS[n].slice(0, 3),
    name: `${WEEKDAYS[n]}s`,
    value: r.average,
    shown: r.average === null ? '' : formatMoney(r.average, currency),
  }));

/** "Sundays · Rp400.000 on average (2 Sundays, Rp800.000 in total)". */
export const weekdayReadout = (b: Bar & Weekday, currency: string) =>
  `${b.name} · ${b.shown} on average (${b.occurrences} ${b.occurrences === 1 ? b.name.slice(0, -1) : b.name}, ${formatMoney(b.total, currency)} in total)`;

/** A cycle's short name under a savings bar ("Aug"). */
export const cycleShort = (month: number) => short(month);

// ---- Counted amounts (R5.12) ----

type Tx = {
  type: string;
  category_id: string | null;
  merchant: string | null;
  allocations: { envelope_id: string; amount: number }[];
};
type Cmd = {
  type: string;
  amount: number;
  split?: {
    people: number;
    parties?: {
      iouAccountId?: string;
      share: number;
      covered?: { amount: number; accountId: string };
    }[];
  };
  pot?: { total: number; people: number; manager?: string };
  fee?: number;
} | null;
export type Line = { label: string; amount: number; counted?: boolean; stickers?: string[] };
/** A person's tab by id: the name it has now, and its "was Abang" / "archived" stickers. */
export type TabOf = (id: string) => { name: string; stickers: string[] } | undefined;

/** The merchant key Insights groups by: lower case, outer spaces trimmed. */
export const merchantKey = (m: string | null) => (m ?? '').trim().toLowerCase();

/**
 * What of this entry counted as spending in the list it sits in (the category or merchant tapped, one currency),
 * and the lines that explain it: a split bill's shares (You counted, Person 2...), a transfer and its fee.
 */
export function counted(
  e: { transactions: Tx[]; command: Cmd },
  match: (t: Tx) => boolean,
  inCurrency: (envelopeId: string) => boolean,
  tab: TabOf = () => undefined,
): { amount: number; lines: Line[] } {
  const amount = e.transactions
    .filter(t => t.type === 'EXPENSE' && match(t))
    .reduce(
      (s, t) =>
        s + t.allocations.filter(a => inCurrency(a.envelope_id)).reduce((x, a) => x - a.amount, 0),
      0,
    );
  const c = e.command;
  if (c?.type === 'EXPENSE' && c.pot) {
    const run = c.pot.manager ? `, run by ${c.pot.manager}` : '';
    return {
      amount,
      lines: [
        { label: `pot, ${c.pot.people} people${run}`, amount: c.pot.total },
        { label: 'You', amount: c.amount, counted: true },
      ],
    };
  }
  if (c?.type === 'EXPENSE' && c.split) {
    const { people, parties } = c.split;
    const each = Math.floor(c.amount / people);
    const who = (p: { iouAccountId?: string }) =>
      p.iouAccountId ? tab(p.iouAccountId) : undefined;
    const others: Line[] = parties
      ? parties.map((p, n) => {
          const t = who(p);
          return { label: t?.name ?? `Person ${n + 2}`, amount: p.share, stickers: t?.stickers };
        })
      : Array.from({ length: people - 1 }, (_, n) => ({ label: `Person ${n + 2}`, amount: each }));
    // A gap I covered from another account is that account's own entry: shown here, counted there.
    const covers: Line[] = (parties ?? []).flatMap((p, n) =>
      p.covered
        ? [
            {
              label: `You cover ${who(p)?.name ?? `Person ${n + 2}`} (${tab(p.covered.accountId)?.name ?? 'other account'})`,
              amount: p.covered.amount,
            },
          ]
        : [],
    );
    const bill = c.amount + covers.reduce((sum, l) => sum + l.amount, 0);
    const mine = parties
      ? c.amount - parties.reduce((sum, p) => sum + p.share, 0)
      : c.amount - each * (people - 1);
    return {
      amount,
      lines: [
        { label: `bill, split with ${people}`, amount: bill },
        { label: 'You', amount: mine, counted: true },
        ...covers,
        ...others,
      ],
    };
  }
  if (c?.type === 'TRANSFER' && c.fee) {
    return {
      amount,
      lines: [
        { label: 'transfer', amount: c.amount },
        { label: 'fee', amount: c.fee, counted: true },
      ],
    };
  }
  return { amount, lines: [] };
}
