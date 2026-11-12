// One payment waiting in the Inbox: what it is, the category it will get, the saved entry it looks like (if
// any), and what to do with it: Add (a new entry), Same one (it is that entry; nothing new), or Dismiss.
import { dayLabel, formatMoney } from '../../lib/format';
import { titleCase } from '../../lib/labels';
import { active, catalog, me, nameOf } from '../../lib/state';
import { inboxApi, inboxQueries, type InboxItem } from '../../models/inbox';
import { persist } from '../../models/query';
import { WinButton } from '../../ui/WinButton';

export function InboxCard({ item }: { item: InboxItem }) {
  const cat = catalog.value;
  const today = me.value?.today ?? '';
  const out = item.amount < 0;
  const name = item.merchant ?? 'No name';
  const currency = cat.accounts.find(a => a.id === item.accountId)?.currency_code;
  // Adding moves balances, budgets and lists, so everything refreshes; the rest only touches the Inbox.
  const inboxOnly = [inboxQueries.all()];
  const add = () => persist(() => inboxApi.add(item.id));

  return (
    <li className="panel rounded-2xl bg-white px-3.5 py-3 dark:bg-raised">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-bold">{name}</span>
        <span className={`num shrink-0 font-extrabold ${out ? '' : 'text-primary'}`}>
          {out ? '−' : '+'}
          {formatMoney(Math.abs(item.amount), currency)}
        </span>
      </div>
      <p className="text-[13px] text-muted">
        {dayLabel(item.date, today)} · {nameOf(cat.accounts, item.accountId)}
        {item.note ? ` · ${item.note}` : ''}
      </p>
      <label className="mt-1 flex items-center gap-2 text-[13px] text-muted">
        Category
        <select
          className="min-w-0 flex-1 bg-transparent text-ink underline"
          aria-label={`Category for ${name}`}
          value={item.categoryId ?? ''}
          onChange={e =>
            persist(() => inboxApi.setCategory(item.id, e.target.value || null), inboxOnly)
          }
        >
          <option value="">{out ? 'Other' : 'Other income'}</option>
          {active(cat.categories)
            .filter(c => c.kind === (out ? 'EXPENSE' : 'INCOME'))
            .map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      {item.suggested && (
        <p className="mt-1 text-[13px]">
          Looks like {titleCase(item.suggested.merchant) || 'an entry'} on{' '}
          {dayLabel(item.suggested.date, today)}, already logged.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.suggested ? (
          <>
            <WinButton
              label={`${name} is the entry already logged`}
              onClick={() => persist(() => inboxApi.link(item.id), inboxOnly)}
            >
              Same one
            </WinButton>
            <WinButton label={`Add ${name} as a new entry anyway`} onClick={add}>
              Add anyway
            </WinButton>
          </>
        ) : (
          <WinButton label={`Add ${name}`} onClick={add}>
            Add
          </WinButton>
        )}
        <WinButton
          label={`Dismiss ${name}`}
          onClick={() => persist(() => inboxApi.dismiss(item.id), inboxOnly)}
        >
          Dismiss
        </WinButton>
      </div>
    </li>
  );
}
