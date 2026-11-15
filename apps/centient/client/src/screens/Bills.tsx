// Bills: what this month still asks for, a calendar of due dates, every bill grouped by how soon it is due, and
// monthly payments found in the entries. A bill opens its form; its PAID? key pays it in one tap.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { BillLine, dayWords } from '../features/recurring/BillLine';
import { DueCalendar } from '../features/recurring/DueCalendar';
import { FoundList } from '../features/recurring/FoundList';
import { MonthHero } from '../features/recurring/MonthHero';
import { RecurringSheet } from '../features/recurring/RecurringSheet';
import { usePayBill } from '../features/recurring/usePayBill';
import { Page } from '../layouts/Page';
import { formatMoney } from '../lib/format';
import { billGroups, monthRun, rowsByDay, type BillRow } from '../models/billRun';
import { recurringQueries, type Recurring } from '../models/recurring';
import type { Prefill } from '../models/recurringForm';
import { WinButton } from '../ui/WinButton';

/** The form that is open: an existing bill, or a new one (maybe filled in from a found payment). */
type Editing = { item: Recurring | null; prefill?: Prefill };

const heading = 'mx-4 mb-1.5 mt-5 text-[13px] uppercase tracking-[0.06em]';
const list = 'panel mx-4 bg-white dark:bg-raised';

export function Bills() {
  const { data } = useQuery(recurringQueries.list());
  const [editing, setEditing] = useState<Editing | null>(null);
  const pay = usePayBill();
  const view = useMemo(
    () =>
      data && {
        runs: monthRun(data.items, data.today),
        byDay: rowsByDay(data.items, data.today),
        groups: billGroups(data.items, data.today),
      },
    [data],
  );
  if (!data || !view) return <Page title="Bills" />;
  const { today } = data;
  const lines = (rows: BillRow[]) =>
    rows.map(row => (
      <BillLine
        key={row.key}
        row={row}
        today={today}
        onOpen={() => setEditing({ item: row.item })}
        trail={pay.trail(row)}
      />
    ));

  return (
    <Page
      title="Bills"
      action={
        <WinButton label="Add a bill" onClick={() => setEditing({ item: null })}>
          + ADD
        </WinButton>
      }
    >
      {data.items.length === 0 && (
        <p className="mx-4 mt-3 text-[15px] text-muted">
          Nothing yet. Add what leaves on a date: streaming, internet, rent, electricity.
        </p>
      )}
      {view.runs.map(run => (
        <MonthHero key={`run:${run.currency}`} run={run} today={today} />
      ))}
      {data.items.length > 0 && view.runs.length === 0 && (
        <p className="panel mx-4 mt-3 bg-white p-3 text-[15px] dark:bg-raised">
          Nothing to pay this month.
        </p>
      )}
      {data.totals.length > 0 && (
        <p className="num mx-4 mt-2 text-[13px] text-muted">
          {data.totals
            .map(
              t =>
                `${formatMoney(t.perMonth, t.currency)} a month · ${formatMoney(t.perYear, t.currency)} a year`,
            )
            .join(' / ')}
        </p>
      )}
      {data.items.length > 0 && (
        <DueCalendar
          byDay={view.byDay}
          today={today}
          tray={(day, rows) => (
            <ul
              className={`${list} !mx-0 mt-2`}
              aria-label={`Due ${dayWords(day, { day: 'numeric', month: 'long' })}`}
            >
              {lines(rows)}
            </ul>
          )}
        />
      )}
      {view.groups.map(g => (
        <section key={`group:${g.label}`}>
          <h2 className={heading}>
            <span aria-hidden="true" className="text-pink">
              ◆{' '}
            </span>
            {g.label}
          </h2>
          <ul className={list} aria-label={g.label}>
            {lines(g.rows)}
          </ul>
        </section>
      ))}
      {data.items.length > 0 && (
        <p className="mx-4 mt-2 text-[13px] text-muted">
          PAID? logs the expense today. Logging it yourself moves the bill on too.
        </p>
      )}
      <FoundList today={today} onAdd={prefill => setEditing({ item: null, prefill })} />
      {pay.layers}
      {editing && (
        <RecurringSheet
          key={`bill:${editing.item?.id ?? editing.prefill?.name ?? 'new'}`}
          item={editing.item}
          prefill={editing.prefill}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  );
}
