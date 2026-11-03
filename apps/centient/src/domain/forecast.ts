// Budget forecast: where spending ends by the close of the period at the speed so far. The server always
// works it out for the running period; the app decides when to show it (the "Forecast starts on day" setting).

export type BudgetStatus = 'ON_TRACK' | 'LIKELY_OVER' | 'OVER';

/** Days from `from` to `to` (YYYY-MM-DD), `from` included, `to` excluded. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

/**
 * `daysGone` counts today (day 1 is the first day). Without it (a past or future period) there is no
 * projection and the status comes from spent and limit alone. Equality is never over.
 */
export function forecast(spent: number, limit: number, cycleDays: number, daysGone: number | null): { projected: number | null; status: BudgetStatus } {
  const projected = daysGone ? Math.round((spent * cycleDays) / daysGone) : null;
  const status = spent > limit ? 'OVER' : projected !== null && projected > limit ? 'LIKELY_OVER' : 'ON_TRACK';
  return { projected, status };
}
