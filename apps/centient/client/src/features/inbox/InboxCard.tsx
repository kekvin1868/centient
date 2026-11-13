// One item waiting in the Inbox. A payment shows what it is, the category it will get and the saved entry it
// looks like (if any): Add (a new entry), Same one (it is that entry; nothing new), Edit (open it in the entry
// form first) or Dismiss. A photo that could not be read fully can only be edited. A balance check (a photo of
// a "Saldo" screen) asks which account and sets that account's balance.
import { dayLabel, formatMoney } from '../../lib/format';
import { titleCase } from '../../lib/labels';
import { active, catalog, everyday, me, nameOf } from '../../lib/state';
import { inboxApi, inboxQueries, type InboxItem } from '../../models/inbox';
import { persist } from '../../models/query';
import { WinButton } from '../../ui/WinButton';

const select = 'min-w-0 flex-1 bg-transparent text-ink underline';

export function InboxCard({ item, onEdit }: { item: InboxItem; onEdit: (i: InboxItem) => void }) {
  const cat = catalog.value;
  const today = me.value?.today ?? '';
  const balance = item.kind === 'BALANCE';
  const out = (item.amount ?? -1) < 0;
  const name = balance ? 'Balance check' : (item.merchant ?? 'No name');
  const currency = cat.accounts.find(a => a.id === item.accountId)?.currency_code;
  const complete = item.amount !== null && item.accountId !== null;
  // Adding moves balances, budgets and lists, so everything refreshes; the rest only touches the Inbox.
  const inboxOnly = [inboxQueries.all()];
  const add = () => persist(() => inboxApi.add(item.id));
  const patch = (json: Parameters<typeof inboxApi.update>[1]) =>
    persist(() => inboxApi.update(item.id, json), inboxOnly);

  return (
    <li className="panel rounded-2xl bg-white px-3.5 py-3 dark:bg-raised">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-bold">{name}</span>
        <span className={`num shrink-0 font-extrabold ${out ? '' : 'text-primary'}`}>
          {item.amount === null
            ? 'Amount not read'
            : `${balance ? '' : out ? '−' : '+'}${formatMoney(Math.abs(item.amount), currency)}`}
        </span>
      </div>
      <p className="text-[13px] text-muted">
        {[
          dayLabel(item.date, today),
          item.accountId && nameOf(cat.accounts, item.accountId),
          item.note,
          item.source === 'UPLOAD' && 'from a photo',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {balance ? (
        <label className="mt-1 flex items-center gap-2 text-[13px] text-muted">
          Account
          <select
            className={select}
            aria-label="Account for this balance"
            value={item.accountId ?? ''}
            onChange={e => e.target.value && patch({ accountId: e.target.value })}
          >
            <option value="">Choose</option>
            {everyday().map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        item.amount !== null && (
          <label className="mt-1 flex items-center gap-2 text-[13px] text-muted">
            Category
            <select
              className={select}
              aria-label={`Category for ${name}`}
              value={item.categoryId ?? ''}
              onChange={e => patch({ categoryId: e.target.value || null })}
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
        )
      )}
      {item.suggested && (
        <p className="mt-1 text-[13px]">
          Looks like {titleCase(item.suggested.merchant) || 'an entry'} on{' '}
          {dayLabel(item.suggested.date, today)}, already logged.
        </p>
      )}
      {!balance && !complete && (
        <p className="mt-1 text-[13px]">
          {item.amount === null ? 'The amount' : 'The account'} is missing: open it to fill it in.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.suggested && (
          <WinButton
            label={`${name} is the entry already logged`}
            onClick={() => persist(() => inboxApi.link(item.id), inboxOnly)}
          >
            Same one
          </WinButton>
        )}
        {complete && (
          <WinButton label={`Add ${name}`} onClick={add}>
            {balance ? 'Set this balance' : item.suggested ? 'Add anyway' : 'Add'}
          </WinButton>
        )}
        {!balance && (
          <WinButton label={`Edit ${name}`} onClick={() => onEdit(item)}>
            Edit
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
