// Home's reminder: bills due within a week (or late) and card bills not paid off yet, one line each; tap to
// go to the Bills tab. A card bill is an old scroll that ages with the bills left unpaid (BillScroll).
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import { comingUp, dueWords, type Upcoming } from '../../models/recurring';
import { useRecurring } from '../../models/useWaiting';
import { lazy, Suspense } from 'react';

// The scroll (and its motion) is downloaded right after Home's first paint; a blank slot of its height holds the
// place for that moment, so it then unrolls into it.
const BillScroll = lazy(() => import('./BillScroll').then(m => ({ default: m.BillScroll })));

const SHOWN = 3;

export function ComingUp({ onOpen }: { onOpen: () => void }) {
  const { data } = useRecurring();
  const due = data ? comingUp(data) : [];
  if (!data || !due.length) return null;
  const accounts = catalog.value.accounts;
  const line = (u: Upcoming) =>
    u.kind === 'card'
      ? {
          title: `${nameOf(accounts, u.card.accountId)} bill`,
          from: 'Card statement',
          amount: formatMoney(
            u.card.left,
            accounts.find(a => a.id === u.card.accountId)?.currency_code,
          ),
        }
      : {
          title: u.item.name,
          from: nameOf(accounts, u.item.accountId),
          amount: u.item.amount === null ? 'Varies' : formatMoney(u.item.amount, u.item.currency),
        };
  return (
    <section className="mx-4 mt-5 flex flex-col gap-2" aria-label="Bills coming up">
      {due.slice(0, SHOWN).map(u => {
        const late = u.due < data.today;
        const { title, from, amount } = line(u);
        if (u.kind === 'card')
          return (
            <Suspense
              key={u.key}
              fallback={<span className="bill-scroll-slot" aria-hidden="true" />}
            >
              <BillScroll
                id={u.card.accountId}
                age={u.card.unpaidBills}
                late={late}
                title={title}
                due={dueWords(u.due, data.today)}
                amount={amount}
                onOpen={onOpen}
              />
            </Suspense>
          );
        return (
          <button
            key={u.key}
            type="button"
            onClick={onOpen}
            className={`panel flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left active:opacity-80 ${late ? 'bg-pink text-white' : 'bg-white dark:bg-raised'}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{title}</span>
              <span className={`block text-[13px] ${late ? '' : 'text-muted'}`}>
                {dueWords(u.due, data.today)} · {from}
              </span>
            </span>
            <span className="num shrink-0 text-[16px] font-extrabold">{amount}</span>
          </button>
        );
      })}
      {due.length > SHOWN && (
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-[13px] text-muted underline"
        >
          {due.length - SHOWN} more coming up
        </button>
      )}
    </section>
  );
}
