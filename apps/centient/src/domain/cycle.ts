// Budget cycles start on the workspace's cycle_start_day (1-31), clamped to the month's last day.
// Dates are YYYY-MM-DD strings in Asia/Jakarta.

const monthLength = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function startIn(y: number, m: number, startDay: number): string {
  return fmt(y, m, Math.min(startDay, monthLength(y, m)));
}

export function cycleStart(day: string, startDay: number): string {
  const [y, m] = day.split('-').map(Number);
  const here = startIn(y, m, startDay);
  if (day >= here) return here;
  return m === 1 ? startIn(y - 1, 12, startDay) : startIn(y, m - 1, startDay);
}

export function nextCycleStart(start: string, startDay: number): string {
  const [y, m] = start.split('-').map(Number);
  return m === 12 ? startIn(y + 1, 1, startDay) : startIn(y, m + 1, startDay);
}

/** Days from `day` to the end of its cycle, counting `day` itself. */
export function daysLeft(day: string, startDay: number): number {
  const end = nextCycleStart(cycleStart(day, startDay), startDay);
  return Math.round((Date.parse(end) - Date.parse(day)) / 864e5);
}

/** Today in Asia/Jakarta (UTC+7, no DST). */
export function jakartaToday(now = Date.now()): string {
  return new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
}

/** A form date (YYYY-MM-DD) or datetime to the stored ISO form with the +07:00 offset. */
export function toOccurredAt(input: string, now = Date.now()): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // Date only: keep today's clock time so same-day entries stay in order.
    const time = new Date(now + 7 * 3600e3).toISOString().slice(11, 19);
    return `${input}T${time}+07:00`;
  }
  return new Date(Date.parse(input) + 7 * 3600e3).toISOString().slice(0, 19) + '+07:00';
}

export const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);

/**
 * A cycle's name: the month holding most of its days, with a fixed cut-off so it never jumps between months.
 * Start day 1-15 takes the month the cycle starts in, 16-31 the month it ends in (Oct 25 - Nov 24 is "Nov").
 */
export function cycleName(from: string, startDay: number): { year: number; month: number } {
  const [y, m] = from.split('-').map(Number);
  if (startDay <= 15) return { year: y, month: m };
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

/** First day of the cycle named January of `year` (start day 25: Dec 25 of the year before). */
export function yearStart(year: number, startDay: number): string {
  return startDay <= 15 ? startIn(year, 1, startDay) : startIn(year - 1, 12, startDay);
}
