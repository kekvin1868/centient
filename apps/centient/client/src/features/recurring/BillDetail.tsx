// One bill's own page (inside Bills): what it costs and how often, when it is next due with its PAID? key, since
// when it has been paid and how much so far, every saved payment, and Pause. Its note, when it has one.
import type { ReactNode } from 'react';
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import { paidLate, rowsOf, type BillRow } from '../../models/billRun';
import { daysBetween } from '../../models/dates';
import { persist } from '../../models/query';
import { dueWords, recurringApi, recurringQueries, type Recurring } from '../../models/recurring';
import { repeatWords } from '../../models/recurringForm';
import { BigMoney } from '../../ui/BigMoney';
import { showToast } from '../../ui/Toast';
import { dayWords } from './BillLine';

const heading = 'mx-4 mb-1.5 mt-5 text-[13px] uppercase tracking-[0.06em]';
const panel = 'panel mx-4 bg-white dark:bg-raised';
const short = (day: string) => dayWords(day, { day: 'numeric', month: 'short' });

export function BillDetail({
  item,
  today,
  trail,
}: {
  item: Recurring;
  today: string;
  /** The PAID? key or stamp for a row (usePayBill). */
  trail: (row: BillRow) => ReactNode;
}) {
  const rows = rowsOf(item, today);
  const paid = rows.filter(r => r.state === 'paid').reverse();
  const next = rows.find(r => r.state !== 'paid');
  const amount = next?.amount ?? item.amount ?? paid[0]?.amount ?? null;
  const pause = async () => {
    if (
      await persist(
        () => recurringApi.update(item.id, { paused: !item.paused }),
        [recurringQueries.all()],
      )
    )
      showToast(item.paused ? 'Bill resumed' : 'Bill paused');
  };

  return (
    <>
      <section aria-label="This bill" className={`${panel} mt-3 flex flex-col gap-1.5 p-3`}>
        {amount === null ? (
          <p className="money-big text-[34px]">Varies</p>
        ) : (
          <p className="flex items-baseline gap-1">
            {item.amount === null && <span className="text-[20px] text-muted">≈</span>}
            <BigMoney minor={amount} currency={item.currency} max={34} inset={80} />
          </p>
        )}
        <p className="text-[13px] text-muted">
          {repeatWords(item.everyMonths)} · paid from{' '}
          {nameOf(catalog.value.accounts, item.accountId)}
        </p>
        {item.note && (
          <p className="whitespace-pre-wrap break-words text-[13px]">Note: {item.note}</p>
        )}
        <div className="flex min-h-11 items-center justify-between gap-3 text-[14px]">
          <span className={next?.state === 'late' ? 'text-negative' : ''}>
            {item.paused
              ? 'Paused: no reminders, outside the month'
              : next
                ? `${dueWords(next.due, today)} · ${short(next.due)}`
                : 'Nothing more due'}
          </span>
          {/* Its PAID? key; once this one is paid and the next is far off, the last payment's stamp. */}
          {(next?.payable ? trail(next) : null) ?? (paid[0] && trail(paid[0]))}
        </div>
      </section>

      <dl className={`${panel} mt-4 grid grid-cols-2`}>
        <div className="flex flex-col px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Paying since</dt>
          <dd className="num text-[16px] font-extrabold">
            {paid.length
              ? dayWords(paid.at(-1)!.paidOn ?? paid.at(-1)!.due, {
                  month: 'short',
                  year: 'numeric',
                })
              : '—'}
          </dd>
        </div>
        <div className="flex flex-col border-l border-edge px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-[0.08em] text-muted">Paid so far</dt>
          <dd className="num text-[16px] font-extrabold">
            {formatMoney(
              paid.reduce((sum, r) => sum + (r.amount ?? 0), 0),
              item.currency,
            )}
          </dd>
        </div>
      </dl>

      <h2 className={heading}>
        <span aria-hidden="true" className="text-pink">
          ◆{' '}
        </span>
        History
      </h2>
      {paid.length === 0 ? (
        <p className="mx-4 text-[13px] text-muted">
          No payments saved yet. They are kept from the first one you make here.
        </p>
      ) : (
        <ul className={panel} aria-label="History">
          {paid.map(r => {
            const days = daysBetween(r.due, r.paidOn ?? r.due);
            return (
              <li
                key={r.key}
                className="flex min-h-14 items-center gap-2.5 border-b border-edge px-2.5 py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px]">Due {short(r.due)}</span>
                  <span className="text-[12px] text-muted">Paid {short(r.paidOn ?? r.due)}</span>
                </span>
                <span className="num text-[14px] font-extrabold">
                  {formatMoney(r.amount ?? 0, item.currency)}
                </span>
                <span
                  className={`whitespace-nowrap border px-1 text-[11px] ${paidLate(r) ? 'border-pink text-negative' : 'text-primary'}`}
                >
                  {paidLate(r) ? `${days} DAY${days === 1 ? '' : 'S'} LATE` : 'ON TIME'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mx-4 mt-5">
        <button type="button" className="keycap keycap-quiet w-full !rounded-[3px]" onClick={pause}>
          {item.paused ? 'RESUME' : 'PAUSE'}
        </button>
      </div>
    </>
  );
}
