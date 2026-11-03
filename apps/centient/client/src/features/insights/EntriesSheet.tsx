// The entries behind one Insights row (a category or a merchant) in the period and currency on screen. Each row
// shows its counted amount, with a split bill's shares or a transfer's fee explained under it, so the rows add up
// to the number tapped. Tapping a row hands the whole entry to the screen, which opens it.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { EntryView } from '../../../../src/repos/entries';
import type { Command } from '../../../../src/lib/schemas';
import { formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { catalog } from '../../lib/state';
import { entryQueries } from '../../models/entry';
import { Sheet } from '../../ui/Sheet';
import { counted, merchantKey } from './insights';

type Entry = EntryView & { command: Command | null };
export type Pick = { title: string; categoryId?: string; merchant?: string };

export function EntriesSheet({
  pick,
  from,
  last,
  currency,
  onClose,
  onOpen,
}: {
  pick: Pick | null;
  from: string;
  last: string;
  currency: string;
  onClose: () => void;
  onOpen: (e: Entry) => void;
}) {
  // The entry tapped opens once this sheet has gone, not on top of it.
  const [chosen, setChosen] = useState<Entry | null>(null);
  const { data } = useQuery({
    ...entryQueries.matching({
      type: 'EXPENSE',
      category: pick?.categoryId,
      merchant: pick?.merchant,
      from,
      to: last,
      currency,
    }),
    enabled: pick !== null,
  });
  const items: Entry[] | null = data ?? null;

  const cat = catalog.value;
  const inCurrency = (id: string) =>
    cat.envelopes.find(e => e.id === id)?.currency_code === currency;
  const match = (t: { category_id: string | null; merchant: string | null }) =>
    pick?.categoryId
      ? t.category_id === pick.categoryId
      : merchantKey(t.merchant) === merchantKey(pick?.merchant ?? '');
  const rows = (items ?? []).map(e => ({
    e,
    r: entryRow(e, cat),
    c: counted(e, match, inCurrency),
  }));
  const total = rows.reduce((s, x) => s + x.c.amount, 0);

  return (
    <Sheet
      open={pick !== null}
      onClose={onClose}
      title={pick?.title ?? ''}
      onClosed={() => {
        if (chosen) {
          onOpen(chosen);
          setChosen(null);
        }
      }}
    >
      {items === null ? (
        <p className="px-4 py-6 text-muted">Loading…</p>
      ) : (
        <ul className="mx-4 mb-4" data-testid="insights-entries">
          {rows.map(({ e, r, c }) => (
            <li key={e.id} className="border-b border-edge">
              <button
                type="button"
                onClick={() => {
                  setChosen(e);
                  onClose();
                }}
                className="block w-full py-2.5 text-left active:opacity-70"
              >
                <span className="flex items-baseline gap-3">
                  <span aria-hidden="true">{r.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-[17px]">{r.title}</span>
                  <span className="num shrink-0 font-semibold">
                    {formatMoney(c.amount, currency)}
                  </span>
                </span>
                <span className="block truncate pl-8 text-[13px] text-muted">
                  {e.occurred_at.slice(0, 10)}
                  {r.sub ? ` · ${r.sub}` : ''}
                </span>
                {c.lines.map(l => (
                  <span
                    key={l.label}
                    className={`num flex justify-between pl-8 text-[13px] ${l.counted ? '' : 'text-muted'}`}
                  >
                    <span>
                      {l.label}
                      {l.counted ? ' · counted' : ''}
                    </span>
                    <span>{formatMoney(l.amount, currency)}</span>
                  </span>
                ))}
              </button>
            </li>
          ))}
          <li className="num flex justify-between py-3 font-semibold">
            <span>Total</span>
            <span data-testid="insights-entries-total">{formatMoney(total, currency)}</span>
          </li>
        </ul>
      )}
    </Sheet>
  );
}
