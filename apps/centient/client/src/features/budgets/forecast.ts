// What a budget row says about its Budget forecast, the device setting for when the forecast starts showing,
// and the Home headline's sum. The server always sends the projection; this decides what the screen shows.
import { shortMoney } from '../../lib/format';
import { load, save } from '../../lib/storage';

export type BudgetStatus = 'ON_TRACK' | 'LIKELY_OVER' | 'OVER';
export const STATUS_LABEL: Record<BudgetStatus, string> = { ON_TRACK: 'On track', LIKELY_OVER: 'Likely over', OVER: 'Over' };

type Row = { currency: string; spent: number; limit: number; daysGone: number | null; projected: number | null; status: BudgetStatus };

const KEY = 'forecastStartDay';
const DEFAULT_START = 3;

/** A stored start day: a whole number clamped to 1-7; anything else is the default 3. */
export const readStartDay = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(7, Math.max(1, v)) : DEFAULT_START);
export const loadStartDay = () => readStartDay(load(KEY, DEFAULT_START));
export const saveStartDay = (day: number) => save(KEY, readStartDay(day));

/**
 * Over shows from day 1 (it needs no projection). Before the start day only a countdown hint; another cycle
 * (no projection) shows nothing. `to` is the cycle's end, excluded.
 */
export function forecastView(r: Row, startDay: number, to: string): { status?: BudgetStatus; line?: string; hint?: string } {
  if (r.status === 'OVER') return { status: 'OVER' };
  if (r.daysGone === null || r.projected === null) return {};
  if (r.daysGone < startDay) {
    const k = startDay - r.daysGone;
    return { hint: `Forecast starts on day ${startDay} · ${k} day${k === 1 ? '' : 's'} to go` };
  }
  return { status: r.status, line: forecastLine(r, to) };
}

/** "At this rate: Rp3,6jt by 30 Nov", plus "runs out around day K" when the limit is reached before the end. */
export function forecastLine(r: Row, to: string): string {
  const last = new Date(Date.parse(to) - 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const line = `At this rate: ${shortMoney(r.projected ?? 0, r.currency)} by ${last}`;
  if (r.projected === null || r.daysGone === null || r.projected <= r.limit || r.spent <= 0) return line;
  return `${line} · runs out around day ${Math.ceil((r.limit * r.daysGone) / r.spent)}`;
}

/** Home's "left this month": rupiah budgets only; budgets in other currencies are never added in. */
export function rupiahLeft(rows: { currency: string; remaining: number; safePerDay: number | null }[]) {
  const idr = rows.filter(b => b.currency === 'IDR');
  return {
    count: idr.length,
    left: idr.reduce((s, b) => s + Math.max(0, b.remaining), 0),
    perDay: idr.reduce((s, b) => s + (b.safePerDay ?? 0), 0),
  };
}
