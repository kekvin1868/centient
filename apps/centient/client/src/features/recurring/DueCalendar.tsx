// A month of due dates: on each day a bill falls due, a pink mark (blinking when late) or an upright "OK" once
// all of that day's bills are paid, and a hollow mark for a card bill. Marks only: a day is not
// a key (the list below says which bill). It goes back to the first saved payment and 11 months ahead, as far as
// the server works the due dates out.
import { useState } from 'react';
import type { BillRow, OtherDue } from '../../models/billRun';
import { monthGrid, plusMonths } from '../../ui/DatePicker';
import { dayWords } from './BillLine';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_AHEAD = 11;
/** "2 bills due", "1 bill paid, 1 card bill", "1 card bill due". */
const label = (bills: number, say: string, more: number) =>
  [
    bills && `${bills} bill${bills === 1 ? '' : 's'} ${say}`,
    more && `${more} card bill${more === 1 ? '' : 's'}${bills ? '' : ' due'}`,
  ]
    .filter(Boolean)
    .join(', ');

export function DueCalendar({
  byDay,
  others,
  today,
}: {
  byDay: Map<string, BillRow[]>;
  /** Card bills by day: marked hollow, never counted as bills. */
  others: Map<string, OtherDue[]>;
  today: string;
}) {
  const first = `${today.slice(0, 7)}-01`;
  const oldest = [...byDay.keys()].reduce((a, b) => (b < a ? b : a), first);
  const start = `${oldest.slice(0, 7)}-01`;
  const [month, setMonth] = useState(first);
  const go = (n: number) => setMonth(m => plusMonths(m, n));
  const nav = 'n-win min-w-8 px-2 py-0.5 disabled:opacity-35';

  return (
    <section className="mx-4 mt-4" aria-label="Bill calendar">
      <div className="mb-2 flex items-center gap-1">
        <p className="flex-1" aria-live="polite">
          {dayWords(month, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          className={nav}
          aria-label="Previous month"
          disabled={month <= start}
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
      <div className="panel bg-white p-2 dark:bg-raised">
        <div
          className="grid grid-cols-7 pb-1 text-center text-[11px] text-muted"
          aria-hidden="true"
        >
          {DOW.map(d => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {monthGrid(month).map(d => {
            const due = byDay.get(d) ?? [];
            const more = others.get(d) ?? [];
            const frame = `num flex h-[42px] flex-col items-center justify-center gap-0.5 border text-[14px] ${d.startsWith(month.slice(0, 7)) ? '' : 'opacity-30'}`;
            if (!due.length && !more.length)
              return (
                <span
                  key={d}
                  className={`${frame} ${d === today ? 'border-current' : 'border-transparent'}`}
                >
                  {Number(d.slice(8))}
                </span>
              );
            const paid = due.every(r => r.state === 'paid');
            const late = due.some(r => r.state === 'late');
            const say = paid ? 'paid' : late ? 'late' : 'due';
            return (
              <span
                key={d}
                role="img"
                aria-label={`${dayWords(d, { day: 'numeric', month: 'long' })}, ${label(due.length, say, more.length)}`}
                className={`${frame} ${d === today ? 'border-current' : 'border-edge'}`}
              >
                {Number(d.slice(8))}
                <span aria-hidden="true" className="flex h-[11px] items-center gap-[3px]">
                  {due.length > 0 &&
                    (paid ? (
                      <span className="border px-0.5 text-[9px] leading-none text-primary">OK</span>
                    ) : (
                      <span className={`h-1.5 w-1.5 bg-pink ${late ? 'bill-late' : ''}`} />
                    ))}
                  {more.length > 0 && <span className="h-1.5 w-1.5 border border-current" />}
                </span>
              </span>
            );
          })}
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-1 px-0.5 pt-1.5 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-1.5 w-1.5 bg-pink" />
            bill due
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="border px-0.5 text-[9px] leading-none text-primary">
              OK
            </span>
            paid
          </span>
          {others.size > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="h-1.5 w-1.5 border border-current" />
              card bill
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
