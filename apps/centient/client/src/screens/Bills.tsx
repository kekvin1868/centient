// Bills: what this month still asks for, a calendar of due dates, every bill grouped by how soon it is due, and
// monthly payments found in the entries. A bill's PAID? key pays it in one tap; the bill itself opens its own
// page (BillDetail), whose EDIT opens the form. Card bills sit among them, tagged, with a key that opens the
// card's pay dialog (a plan's slices ride inside its card's bill).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { BillDetail } from '../features/recurring/BillDetail';
import { BillLine } from '../features/recurring/BillLine';
import { DueCalendar } from '../features/recurring/DueCalendar';
import { FoundList } from '../features/recurring/FoundList';
import { MonthHero } from '../features/recurring/MonthHero';
import { OtherLine, otherName } from '../features/recurring/OtherLine';
import { PayCardSheet } from '../features/recurring/PayCardSheet';
import { RecurringSheet } from '../features/recurring/RecurringSheet';
import { usePayBill } from '../features/recurring/usePayBill';
import { Page } from '../layouts/Page';
import { useSubPage } from '../layouts/useSubPage';
import { categoryEmoji } from '../lib/labels';
import { catalog, nameOf } from '../lib/state';
import { formatMoney } from '../lib/format';
import {
  billGroups,
  monthRun,
  otherDues,
  othersByDay,
  outsideRun,
  rowsByDay,
  type BillGroup,
  type OtherDue,
} from '../models/billRun';
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
  /** The card bill whose pay dialog is open. */
  const [paying, setPaying] = useState<OtherDue | null>(null);
  /** The bill whose page is open. */
  const [opened, open, back] = useSubPage<string>();
  const item = data?.items.find(i => i.id === opened);
  // Removed from its own page: back to the list.
  useEffect(() => {
    if (data && opened && !item) back();
  }, [data, opened, item]);
  const view = useMemo(() => {
    if (!data) return null;
    const others = otherDues(data.cards, data.today);
    return {
      others,
      runs: monthRun(data.items, data.today),
      byDay: rowsByDay(data.items, data.today),
      othersByDay: othersByDay(others),
      groups: billGroups(data.items, data.today, others),
    };
  }, [data]);
  const pay = usePayBill(view?.others.filter(o => o.next).map(otherName));
  if (!data || !view) return <Page title="Bills" />;
  const { today } = data;
  const lines = (rows: BillGroup['rows']) =>
    rows.map(row =>
      'kind' in row ? (
        <OtherLine key={row.key} due={row} today={today} onPay={() => setPaying(row)} />
      ) : (
        <BillLine
          key={row.key}
          row={row}
          today={today}
          onOpen={() => open(row.item.id)}
          trail={pay.trail(row)}
        />
      ),
    );
  const card = paying && catalog.value.accounts.find(a => a.id === paying.accountId);

  const sheets = (
    <>
      {pay.layers}
      {paying && card && (
        <PayCardSheet
          card={card}
          left={paying.amount}
          today={today}
          onClose={() => setPaying(null)}
        />
      )}
      {editing && (
        <RecurringSheet
          key={`bill:${editing.item?.id ?? editing.prefill?.name ?? 'new'}`}
          item={editing.item}
          prefill={editing.prefill}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );

  if (item)
    return (
      <Page
        key={`bill:${item.id}`}
        title={`${categoryEmoji(nameOf(catalog.value.categories, item.categoryId))} ${item.name}`}
        back={{ label: 'Bills', onBack: back }}
        action={
          <WinButton label={`Edit ${item.name}`} onClick={() => setEditing({ item })}>
            EDIT
          </WinButton>
        }
      >
        <BillDetail item={item} today={today} trail={pay.trail} />
        {sheets}
      </Page>
    );

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
        <MonthHero
          key={`run:${run.currency}`}
          run={run}
          today={today}
          outside={outsideRun(view.others, today)}
        />
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
      {(data.items.length > 0 || view.others.length > 0) && (
        <DueCalendar byDay={view.byDay} others={view.othersByDay} today={today} />
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
      <FoundList today={today} onAdd={prefill => setEditing({ item: null, prefill })} />
      {sheets}
    </Page>
  );
}
