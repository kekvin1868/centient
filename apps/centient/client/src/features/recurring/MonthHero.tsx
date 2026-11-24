// The Bills page's hero: what this month still asks for (in one currency), how many of its bills are paid, and
// an HP bar that drains as they are.
import { formatMoney } from '../../lib/format';
import type { MonthRun } from '../../models/billRun';
import { BigMoney } from '../../ui/BigMoney';
import { HpBar } from '../../ui/HpBar';
import { dayWords } from '../../models/dates';

const chip = 'border border-edge px-1.5 text-[12px]';

export function MonthHero({
  run,
  today,
  outside,
}: {
  run: MonthRun;
  today: string;
  /** Card bills due this month: shown on the page, not counted here. */
  outside: number;
}) {
  const month = dayWords(today, { month: 'long', year: 'numeric' });
  return (
    <section
      aria-label={`Bills in ${month}`}
      className="panel mx-4 mt-3 flex flex-col gap-1.5 bg-white p-3 dark:bg-raised"
    >
      <p className="flex items-center justify-between text-[12px] tracking-[0.08em]">
        <span className="uppercase">
          <span aria-hidden="true" className="text-pink">
            ◆{' '}
          </span>
          {month}
        </span>
        <span className="num bg-ink px-1.5 text-raised">
          {run.paid}/{run.count} PAID
        </span>
      </p>
      <BigMoney minor={run.left} currency={run.currency} max={34} inset={58} />
      <p className="text-[13px] text-muted">left to pay this month</p>
      <HpBar size="big" value={run.left} max={run.total} />
      <p className="flex flex-wrap gap-1.5">
        {run.late > 0 && (
          <span className={`${chip} bill-late border-pink text-negative`}>{run.late} LATE</span>
        )}
        <span className={`${chip} num`}>{formatMoney(run.total, run.currency)} total</span>
        {run.unknown > 0 && <span className={`${chip} text-muted`}>+{run.unknown} that vary</span>}
        {outside > 0 && <span className={`${chip} text-muted`}>+{outside} outside the bar</span>}
      </p>
    </section>
  );
}
