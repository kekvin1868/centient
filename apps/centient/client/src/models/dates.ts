// Calendar helpers shared with the Worker (pure, no I/O): one copy of the date maths for both sides.
export { addDays, jakartaToday } from '../../../src/domain/cycle';
export { daysBetween } from '../../../src/domain/forecast';
export { readDay, type DayOrder } from '../../../src/domain/readDay';

/** A day (YYYY-MM-DD) in words, read as a calendar date (no time zone shift): dayWords(d, { month: 'long' }). */
export const dayWords = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

/** A card bill's month (YYYY-MM) as the statement names it: "Dec". */
export const billMonth = (m: string) => dayWords(`${m}-01`, { month: 'short' });
