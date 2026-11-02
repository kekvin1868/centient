// Insights use cases: read the ledger back per period and currency (totals, savings rate, the comparison with the
// previous period, spending by category, the trend, Daily Wallet Spending, top merchants, biggest expenses).
// Period boundaries are worked out here, never on the phone.
import type { ServiceDeps } from '../../context';
import { addDays, cyclesIn, jakartaToday, periodOf, realDay, type PeriodKind } from '../../domain/cycle';
import { daysBetween } from '../../domain/forecast';
import { DomainError } from '../../domain/ledger';
import { commandOf } from '../../lib/entryCommand';
import type { CurrencyTotals } from '../../repos/reports';

export type { PeriodKind };

const ZERO = { spending: 0, income: 0 };
const pick = (rows: CurrencyTotals[], currency: string) => rows.find(r => r.currency === currency) ?? ZERO;

/**
 * Daily Wallet Spending: per weekday (Monday first) the spending total, how many of that weekday passed in
 * [from, end), and the rounded average; a weekday that has not come round yet has no average (never 0 / 0).
 */
export function weekdays(daily: { day: string; amount: number }[], from: string, end: string) {
  const rows = Array.from({ length: 7 }, () => ({ total: 0, occurrences: 0 }));
  const dow = (day: string) => (new Date(Date.parse(day)).getUTCDay() + 6) % 7; // Monday = 0
  for (let d = from; d < end; d = addDays(d, 1)) rows[dow(d)].occurrences++;
  for (const r of daily) if (r.day >= from && r.day < end) rows[dow(r.day)].total += r.amount;
  return rows.map(r => ({ ...r, average: r.occurrences ? Math.round(r.total / r.occurrences) : null }));
}

export function createReportsService({ ws, now, repos }: ServiceDeps) {
  return {
    async insights(i: { period?: PeriodKind; date?: string; currency?: string } = {}) {
      const kind = i.period ?? 'cycle';
      const today = jakartaToday(now());
      const day = i.date ?? today;
      if (!realDay(day)) throw new DomainError('VALIDATION', 'Use a real date (YYYY-MM-DD)');
      const w = await repos.workspaces.get(ws);
      const { span, before } = periodOf(kind, day, w.cycle_start_day);

      // While the period runs, compare the same number of days of the one before (capped at its length).
      const running = today >= span.from && today < span.to;
      const elapsedDays = running ? daysBetween(span.from, today) + 1 : today >= span.to ? daysBetween(span.from, span.to) : 0;
      const capped = addDays(before.from, elapsedDays);
      const prevTo = running && capped < before.to ? capped : before.to;
      // The days that have happened: through today while running, the whole period once it ended.
      const end = running ? addDays(today, 1) : today >= span.to ? span.to : span.from;

      const [rows, prevRows, oldest] = await Promise.all([
        repos.reports.totals(ws, span.from, span.to), repos.reports.totals(ws, before.from, prevTo), repos.reports.oldest(ws),
      ]);
      const active = rows.filter(r => r.spending !== 0 || r.income !== 0);
      const currencies = active.map(r => r.currency).sort((a, b) => (a === 'IDR' ? -1 : b === 'IDR' ? 1 : a.localeCompare(b)));
      const busiest = [...active].sort((a, b) => b.entries - a.entries)[0]?.currency;
      const currency = i.currency ?? (currencies.includes('IDR') ? 'IDR' : busiest ?? 'IDR');
      const { spending, income } = pick(rows, currency);
      const previous = pick(prevRows, currency);

      const [categories, daily, merchants, biggest] = await Promise.all([
        repos.reports.byCategory(ws, currency, span.from, span.to), repos.reports.daily(ws, currency, span.from, span.to),
        repos.reports.merchants(ws, currency, span.from, span.to), repos.reports.biggest(ws, currency, span.from, span.to),
      ]);
      const sum = (from: string, to: string) => daily.reduce((s, r) => (r.day >= from && r.day < to ? s + r.amount : s), 0);
      // One slot per day (cycle) or per cycle (year); slots not reached yet are null, not 0.
      const trend = kind === 'cycle'
        ? Array.from({ length: daysBetween(span.from, span.to) }, (_, n) => {
          const d = addDays(span.from, n);
          return { from: d, amount: d < end ? sum(d, addDays(d, 1)) : null };
        })
        : cyclesIn(span.from, span.to, w.cycle_start_day).map(c => ({ from: c.from, month: c.month, amount: c.from < end ? sum(c.from, c.to) : null }));
      // ponytail: one lookup per row (5 at most); a batch get when the list grows.
      const entries = await Promise.all(biggest.map(b => repos.entries.get(ws, b.entryId)));

      return {
        period: { kind, from: span.from, to: span.to, last: addDays(span.to, -1), today, elapsedDays, year: span.year, month: span.month },
        oldest,
        currencies,
        currency,
        spending,
        income,
        /** Percent, unrounded; null without income (never divide by zero); negative when spending is over income. */
        savingsRate: income > 0 ? ((income - spending) / income) * 100 : null,
        previous: {
          from: before.from, to: prevTo, year: before.year, month: before.month,
          spending: previous.spending, income: previous.income, basis: running ? 'SAME_DAYS' as const : 'FULL' as const,
        },
        categories,
        trend,
        weekdays: weekdays(daily, span.from, end),
        merchants: merchants.map(m => ({ key: m.key, name: m.latest.slice(m.latest.indexOf('|') + 1), total: m.total, visits: m.visits })),
        biggest: biggest.flatMap((b, n) => {
          const e = entries[n];
          return e ? [{ amount: b.amount, entry: { ...e, command: commandOf(e) } }] : [];
        }),
      };
    },
  };
}
