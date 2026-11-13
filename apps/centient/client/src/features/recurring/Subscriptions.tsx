// The Subscriptions screen (a sheet): what the bills cost a month and a year, a calendar of due dates, every
// bill, and monthly payments found in the entries. A bill opens its form, which takes this sheet's place.
import { useQuery } from '@tanstack/react-query';
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { categoryEmoji } from '../../lib/labels';
import { catalog, nameOf } from '../../lib/state';
import { dueWords, recurringQueries, type Recurring } from '../../models/recurring';
import { repeatWords, type Prefill } from '../../models/recurringForm';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { DueCalendar } from './DueCalendar';
import { FoundList } from './FoundList';
import { RecurringSheet } from './RecurringSheet';

/** The form that is open: an existing bill, or a new one (maybe filled in from a found payment). */
type Editing = { item: Recurring | null; prefill?: Prefill };

export function Subscriptions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useQuery({ ...recurringQueries.list(), enabled: open });
  const [editing, setEditing] = useState<Editing | null>(null);
  const cat = catalog.value;

  return (
    <>
      <Sheet open={open && !editing} onClose={onClose} title="Subscriptions">
        {data && (
          <>
            {data.totals.map(t => (
              <p key={`total:${t.currency}`} className="px-4 pt-3">
                <span className="num block text-[28px] font-extrabold leading-tight">
                  {formatMoney(t.perMonth, t.currency)}
                  <span className="text-[15px] font-normal text-muted"> a month</span>
                </span>
                <span className="num text-[15px] text-muted">
                  {formatMoney(t.perYear, t.currency)} a year
                </span>
              </p>
            ))}
            {data.items.length > 0 && (
              <div className="mt-4">
                <DueCalendar items={data.items} today={data.today} />
              </div>
            )}
            <Group
              label="Bills"
              foot={
                data.items.length
                  ? 'Log a payment as usual and its bill moves to the next due date by itself.'
                  : 'Nothing yet. Add what leaves on a date: streaming, internet, rent, electricity.'
              }
            >
              {data.items.map(item => (
                <Row
                  key={`recurring:${item.id}`}
                  media={
                    <span aria-hidden="true">
                      {categoryEmoji(nameOf(cat.categories, item.categoryId))}
                    </span>
                  }
                  title={item.name}
                  sub={
                    item.paused
                      ? 'Paused'
                      : `${dueWords(item.nextDue, data.today)} · ${repeatWords(item.everyMonths)} · ${nameOf(cat.accounts, item.accountId)}`
                  }
                  trail={
                    <span className="num">
                      {item.amount === null ? 'Varies' : formatMoney(item.amount, item.currency)}
                    </span>
                  }
                  onClick={() => setEditing({ item })}
                />
              ))}
            </Group>
            <FoundList today={data.today} onAdd={prefill => setEditing({ item: null, prefill })} />
            <Block>
              <Button large rounded onClick={() => setEditing({ item: null })}>
                Add a bill
              </Button>
            </Block>
          </>
        )}
      </Sheet>
      {editing && data && (
        <RecurringSheet
          key={`bill:${editing.item?.id ?? editing.prefill?.name ?? 'new'}`}
          item={editing.item}
          prefill={editing.prefill}
          today={data.today}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
