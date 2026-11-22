// One plan in the list: progress only (its slices are paid with the card's bill), and one pip per slice.
import { ClockCountdown } from '@phosphor-icons/react';
import type { Plan } from '../../models/installment';
import { formatMoney } from '../../lib/format';
import { billMonth } from '../../models/recurring';

export function PlanCard({
  plan: p,
  currency,
  onOpen,
}: {
  plan: Plan;
  currency: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="panel flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left active:opacity-80 dark:bg-raised"
      aria-label={`${p.name}, ${p.paidCount} of ${p.installments} paid`}
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full bg-raised-2"
        aria-hidden="true"
      >
        <ClockCountdown size={20} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{p.name}</span>
        <span
          className={`block truncate text-[13px] ${p.next?.overdue ? 'font-semibold text-negative' : 'text-muted'}`}
        >
          {p.next
            ? `${formatMoney(p.amountPerInstallment, currency)} a month · slice ${p.next.no} on the ${billMonth(p.next.bill)} bill${p.next.overdue ? ', unpaid' : ''}`
            : 'All paid'}
          {p.parties.length > 1 ? ` · ${p.parties.length} people` : ''}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[12px] font-bold text-muted">
          {p.paidCount}/{p.installments}
        </span>
        {/* One pip per installment, filled when fully paid. */}
        <span className="flex gap-1" aria-hidden="true">
          {p.schedule.slice(0, 12).map(s => (
            <span
              key={s.no}
              className={`h-2 w-2 rounded-[2px] ${s.left === 0 ? 'bg-miku' : 'bg-raised-2'}`}
            />
          ))}
        </span>
      </span>
    </button>
  );
}
