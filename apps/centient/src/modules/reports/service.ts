// Insights use cases: read the ledger back per period and currency (totals, savings rate, the comparison with the
// previous period, spending by category). Period boundaries are worked out here, never on the phone.
import type { ServiceDeps } from '../../context';
import { addDays, cycleName, cycleStart, jakartaToday, nextCycleStart, yearStart } from '../../domain/cycle';
import { daysBetween } from '../../domain/forecast';
import { DomainError } from '../../domain/ledger';
import type { CurrencyTotals } from '../../repos/reports';

export type PeriodKind = 'cycle' | 'year';
type Span = { from: string; to: string; year: number; month: number | null };

/** The cycle (or the year of cycles named Jan to Dec) holding `day`, and the one before it. */
export function periodOf(kind: PeriodKind, day: string, startDay: number): { span: Span; before: Span } {
  const from = cycleStart(day, startDay);
  if (kind === 'cycle') {
    const prev = cycleStart(addDays(from, -1), startDay);
    return {
      span: { from, to: nextCycleStart(from, startDay), ...cycleName(from, startDay) },
      before: { from: prev, to: from, ...cycleName(prev, startDay) },
    };
  }
  const { year } = cycleName(from, startDay);
  return {
    span: { from: yearStart(year, startDay), to: yearStart(year + 1, startDay), year, month: null },
    before: { from: yearStart(year - 1, startDay), to: yearStart(year, startDay), year: year - 1, month: null },
  };
}

const ZERO = { spending: 0, income: 0 };
const pick = (rows: CurrencyTotals[], currency: string) => rows.find(r => r.currency === currency) ?? ZERO;

export function createReportsService({ ws, now, repos }: ServiceDeps) {
  return {
    async insights(i: { period?: PeriodKind; date?: string; currency?: string } = {}) {
      const kind = i.period ?? 'cycle';
      const today = jakartaToday(now());
      const day = i.date ?? today;
      // A real calendar day survives a round trip (Feb 31 comes back as Mar 3; month 13 throws).
      const real = (() => { try { return addDays(day, 0) === day; } catch { return false; } })();
      if (!real) throw new DomainError('VALIDATION', 'Use a real date (YYYY-MM-DD)');
      const w = await repos.workspaces.get(ws);
      const { span, before } = periodOf(kind, day, w.cycle_start_day);

      // While the period runs, compare the same number of days of the one before (capped at its length).
      const running = today >= span.from && today < span.to;
      const elapsedDays = running ? daysBetween(span.from, today) + 1 : today >= span.to ? daysBetween(span.from, span.to) : 0;
      const capped = addDays(before.from, elapsedDays);
      const prevTo = running && capped < before.to ? capped : before.to;

      const [rows, prevRows, oldest] = await Promise.all([
        repos.reports.totals(ws, span.from, span.to), repos.reports.totals(ws, before.from, prevTo), repos.reports.oldest(ws),
      ]);
      const active = rows.filter(r => r.spending !== 0 || r.income !== 0);
      const currencies = active.map(r => r.currency).sort((a, b) => (a === 'IDR' ? -1 : b === 'IDR' ? 1 : a.localeCompare(b)));
      const busiest = [...active].sort((a, b) => b.entries - a.entries)[0]?.currency;
      const currency = i.currency ?? (currencies.includes('IDR') ? 'IDR' : busiest ?? 'IDR');
      const { spending, income } = pick(rows, currency);
      const previous = pick(prevRows, currency);

      return {
        period: { kind, from: span.from, to: span.to, today, elapsedDays, year: span.year, month: span.month },
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
        categories: await repos.reports.byCategory(ws, currency, span.from, span.to),
      };
    },
  };
}
