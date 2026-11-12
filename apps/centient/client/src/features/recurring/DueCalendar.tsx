// A month of due dates: a mark on each day a bill falls due; tap a marked day to list its bills under the
// grid. It looks from this month to 11 months ahead, as far as the server works the due dates out.
import { useMemo, useState } from 'react';
import { formatMoney } from '../../lib/format';
import { dueByDay, type Recurring } from '../../models/recurring';
import { monthGrid, plusMonths } from '../../ui/DatePicker';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_AHEAD = 11;
const words = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

export function DueCalendar({ items, today }: { items: Recurring[]; today: string }) {
  const first = `${today.slice(0, 7)}-01`;
  const [month, setMonth] = useState(first);
  const [picked, setPicked] = useState<string | null>(null);
  const byDay = useMemo(() => dueByDay(items), [items]);
  const go = (n: number) => {
    setMonth(m => plusMonths(m, n));
    setPicked(null);
  };
  const nav = 'n-win min-w-8 px-2 py-0.5 disabled:opacity-35';
  const due = picked ? (byDay.get(picked) ?? []) : [];

  return (
    <section className="px-4" aria-label="Bill calendar">
      <div className="mb-2 flex items-center gap-1">
        <p className="flex-1 font-bold" aria-live="polite">
          {words(month, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          className={nav}
          aria-label="Previous month"
          disabled={month === first}
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className={nav}
          aria-label="Next month"
          disabled={month === plusMonths(first, MONTHS_AHEAD)}
          onClick={() => go(1)}
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
      <div className="grid grid-cols-7 gap-0.5">
        {monthGrid(month).map(d => {
          const count = byDay.get(d)?.length ?? 0;
          const frame = `num flex h-10 flex-col items-center justify-center border ${d === today ? 'border-current' : 'border-transparent'} ${d.startsWith(month.slice(0, 7)) ? '' : 'opacity-35'}`;
          if (!count)
            return (
              <span key={d} className={frame}>
                {Number(d.slice(8))}
              </span>
            );
          return (
            <button
              key={d}
              type="button"
              aria-pressed={d === picked}
              aria-label={`${words(d, { day: 'numeric', month: 'long' })}, ${count} bill${count === 1 ? '' : 's'} due`}
              onClick={() => setPicked(p => (p === d ? null : d))}
              className={`${frame} ${d === picked ? 'bg-miku text-on-miku' : ''}`}
            >
              {Number(d.slice(8))}
              <span
                aria-hidden="true"
                className={`h-1 w-1 ${d === picked ? 'bg-on-miku' : 'bg-pink'}`}
              />
            </button>
          );
        })}
      </div>
      {picked && (
        <ul
          className="mt-2 text-[15px]"
          aria-label={`Due ${words(picked, { day: 'numeric', month: 'long' })}`}
        >
          {due.map(item => (
            <li key={item.id} className="flex justify-between gap-3 py-1">
              <span className="truncate">{item.name}</span>
              <span className="num shrink-0">
                {item.amount === null ? 'Varies' : formatMoney(item.amount, item.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
