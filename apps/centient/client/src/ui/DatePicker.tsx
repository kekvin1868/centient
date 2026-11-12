// A month calendar in the app's own look, shown inline under the line that opened it (so no dialog opens on a
// dialog): month title, ‹ • › (previous month, today, next month), Su–Sa, six weeks. Today is outlined, days of the
// other months are faint, the picked day is filled teal. Arrows move a day / a week (across months), Enter picks,
// Escape closes. Colours come from the text it sits on (currentColor), so it reads on the receipt paper and in
// both themes. Dates are YYYY-MM-DD strings; maths in UTC so no time zone shifts a day.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (s: string, n: number) => {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** Same day n months on, kept inside the month (31 Jan + 1 = 28/29 Feb). */
export const plusMonths = (s: string, n: number) => {
  const d = utc(s);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0)).getUTCDate();
  return iso(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(d.getUTCDate(), last))),
  );
};
// ponytail: the phone's local day; every user is in Jakarta today. Pass `today` if that ever differs.
const localToday = () => {
  const d = new Date();
  return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
};
/** The 42 days shown for `day`'s month: from the Sunday on or before the 1st. */
export const monthGrid = (day: string) => {
  const first = `${day.slice(0, 7)}-01`;
  const start = plusDays(first, -utc(first).getUTCDay());
  return Array.from({ length: 42 }, (_, i) => plusDays(start, i));
};
const fmt = (s: string, o: Intl.DateTimeFormatOptions) =>
  utc(s).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function DatePicker({
  label,
  value,
  onPick,
  onClose,
  onClear,
  today = localToday(),
}: {
  label: string;
  value: string;
  onPick: (day: string) => void;
  onClose: () => void;
  /** Shows "Clear" for a date that may stay empty. */
  onClear?: () => void;
  today?: string;
}) {
  const [cursor, setCursor] = useState(value || today);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(true);
  // Opening puts focus on the picked day (or today); an arrow key move follows the cursor. ‹ › keep their focus.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus();
  }, [cursor]);

  const month = cursor.slice(0, 7);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // close the calendar, not the sheet around it
      e.preventDefault();
      onClose();
    } else if (e.key in MOVES) {
      e.preventDefault();
      moved.current = true;
      setCursor(c => plusDays(c, MOVES[e.key]));
    }
  };

  const nav = 'n-win min-w-8 px-2 py-0.5';
  return (
    <div className="py-2" role="group" aria-label={`${label} calendar`} onKeyDown={onKeyDown}>
      <div className="mb-2 flex items-center gap-1">
        <p className="flex-1 font-bold" aria-live="polite">
          {fmt(cursor, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          className={nav}
          aria-label="Previous month"
          onClick={() => setCursor(c => plusMonths(c, -1))}
        >
          ‹
        </button>
        <button type="button" className={nav} aria-label="Today" onClick={() => setCursor(today)}>
          •
        </button>
        <button
          type="button"
          className={nav}
          aria-label="Next month"
          onClick={() => setCursor(c => plusMonths(c, 1))}
        >
          ›
        </button>
      </div>
      <div
        className="grid grid-cols-7 text-center text-[12px] uppercase opacity-60"
        aria-hidden="true"
      >
        {DOW.map(d => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div ref={grid} className="grid grid-cols-7 gap-0.5">
        {monthGrid(cursor).map(d => {
          const picked = d === value;
          return (
            <button
              key={d}
              type="button"
              data-date={d}
              tabIndex={d === cursor ? 0 : -1}
              aria-label={fmt(d, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              aria-pressed={picked}
              aria-current={d === today ? 'date' : undefined}
              onClick={() => onPick(d)}
              className={`num h-9 border ${picked ? 'border-transparent bg-miku text-on-miku' : d === today ? 'border-current' : 'border-transparent'} ${d.startsWith(month) ? '' : 'opacity-35'}`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      {onClear && value && (
        <button type="button" className="mt-2 text-[13px] underline" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  );
}
