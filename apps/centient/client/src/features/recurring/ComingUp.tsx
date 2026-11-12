// Home's reminder: bills due within a week (or late) and card bills not paid off yet, one line each; tap to
// open Subscriptions.
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import { comingUp, dueWords, recurringQueries, type Upcoming } from '../../models/recurring';

const SHOWN = 3;

export function ComingUp({ onOpen }: { onOpen: () => void }) {
  const { data } = useQuery(recurringQueries.list());
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
