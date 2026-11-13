// Finds a calendar day written in text: a spreadsheet's date cell, or a line of a receipt.
// Shapes: 2026-11-10 (with or without a time), 10/11/2026, 10-11-26, 10 Nov 2026, 4 Okt 2026, Nov 10, 2026.

/** Whether 10/11 is the 10th of November (day first, the default here) or October 11th. */
export type DayOrder = 'DMY' | 'MDY';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_ID: Record<string, string> = { mei: 'may', agu: 'aug', okt: 'oct', des: 'dec' };
const monthOf = (word: string) => {
  const w = word.toLowerCase().slice(0, 3);
  return MONTHS.indexOf(MONTHS_ID[w] ?? w) + 1;
};
const dayOf = (y: number, m: number, d: number) => {
  const year = y < 100 ? 2000 + y : y;
  const day = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Round-trips only for a real calendar day (no 31 February, no month 13).
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day ? day : null;
};

/**
 * The first day written in `text` as YYYY-MM-DD, or null. The shape that matches first decides: a date that
 * is written but is not a real day (31/02/2026) is null, never re-read another way.
 */
export function readDay(text: string, order: DayOrder = 'DMY'): string | null {
  // (?<!\d) and (?!\d): a date never starts or ends inside a longer number (an amount, a reference).
  let m = text.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (m) return dayOf(+m[1], +m[2], +m[3]);
  m = text.match(/(?<![\d.,])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (m) return order === 'DMY' ? dayOf(+m[3], +m[2], +m[1]) : dayOf(+m[3], +m[1], +m[2]);
  m = text.match(/(?<!\d)(\d{1,2})[ -]([A-Za-z]{3,})[ -,]+(\d{4}|\d{2})(?!\d)/);
  if (m && monthOf(m[2])) return dayOf(+m[3], monthOf(m[2]), +m[1]);
  m = text.match(/\b([A-Za-z]{3,}) (\d{1,2}),? (\d{4})(?!\d)/);
  if (m && monthOf(m[1])) return dayOf(+m[3], monthOf(m[1]), +m[2]);
  return null;
}
