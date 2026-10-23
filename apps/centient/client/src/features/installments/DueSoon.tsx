// Home's reminder: installments due within 3 days (or overdue), one line each; tap to open Money.
import { dayLabel, formatMoney } from '../../lib/format';
import { catalog, me } from '../../lib/state';
import { dueSoon, usePlans } from './plans';

export function DueSoon({ onGo }: { onGo: () => void }) {
  const plans = usePlans();
  const today = me.value?.today ?? '';
  const due = plans ? dueSoon(plans, today) : [];
  if (!due.length) return null;
  const accounts = catalog.value.accounts;
  return (
    <section className="mx-4 -mt-2 mb-5 flex flex-col gap-2" aria-label="Installments due soon">
      {due.slice(0, 3).map(p => {
        const acc = accounts.find(a => a.id === p.accountId);
        const overdue = p.next!.due < today;
        return (
          <button key={p.id} type="button" onClick={onGo}
            className={`panel flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left active:opacity-80 ${overdue ? 'bg-pink text-white' : 'bg-white dark:bg-raised'}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{acc?.name} · {p.name}</span>
              <span className={`block text-[13px] ${overdue ? '' : 'text-muted'}`}>{overdue ? 'Overdue since' : 'Due'} {dayLabel(p.next!.due, today)} · installment {p.next!.no} of {p.installments}</span>
            </span>
            <span className="num shrink-0 text-[16px] font-extrabold">{formatMoney(p.next!.left, acc?.currency_code)}</span>
          </button>
        );
      })}
    </section>
  );
}
