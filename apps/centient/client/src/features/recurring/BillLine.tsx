// One bill on the Bills page: emoji, name, when it is due (or was paid) and from where, its amount. The row
// opens the bill; `trail` sits beside it as its own control (a key inside the row's button would not be valid).
import type { ReactNode } from 'react';
import { formatMoney } from '../../lib/format';
import { categoryEmoji } from '../../lib/labels';
import { catalog, nameOf } from '../../lib/state';
import { paidLate, type BillRow } from '../../models/billRun';
import { dueWords } from '../../models/recurring';

export const dayWords = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });

const when = (row: BillRow, today: string) => {
  if (row.item.paused) return 'Paused';
  if (row.state !== 'paid') return dueWords(row.due, today);
  const on = dayWords(row.paidOn ?? row.due, { day: 'numeric', month: 'short' });
  return paidLate(row) ? `Paid ${on}, late` : `Paid ${on}`;
};

export function BillLine({
  row,
  today,
  onOpen,
  trail,
}: {
  row: BillRow;
  today: string;
  onOpen: () => void;
  trail?: ReactNode;
}) {
  const { item } = row;
  const cat = catalog.value;
  const quiet = row.state === 'paid' || item.paused;
  return (
    <li className="flex min-h-14 items-center gap-2 border-b border-edge pr-2.5 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch py-2 pl-2.5 text-left active:opacity-60"
      >
        <span aria-hidden="true" className="text-[20px] leading-none">
          {categoryEmoji(nameOf(cat.categories, item.categoryId))}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-[15px] ${quiet ? 'text-muted' : ''}`}>{item.name}</span>
          <span
            className={`truncate text-[12px] ${row.state === 'late' ? 'text-negative' : 'text-muted'}`}
          >
            {when(row, today)} · {nameOf(cat.accounts, item.accountId)}
          </span>
        </span>
        <span className={`num shrink-0 text-[14px] font-extrabold ${quiet ? 'text-muted' : ''}`}>
          {row.amount === null
            ? 'Varies'
            : `${row.guess ? '≈ ' : ''}${formatMoney(row.amount, item.currency)}`}
        </span>
      </button>
      {trail}
    </li>
  );
}
