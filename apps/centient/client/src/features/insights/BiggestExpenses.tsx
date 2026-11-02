// The five biggest expenses of the period: each shows what counted (a split bill's share, a transfer's fee) and
// opens the whole entry when tapped.
import type { EntryView } from '../../../../src/repos/entries';
import type { Command } from '../../../../src/lib/schemas';
import { formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { catalog } from '../../lib/state';

type Entry = EntryView & { command: Command | null };

export function BiggestExpenses({ rows, currency, onOpen }: { rows: { amount: number; entry: Entry }[]; currency: string; onOpen: (e: Entry) => void }) {
  if (!rows.length) return <p className="mx-4 border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">No spending in this period yet.</p>;
  return (
    <ol className="mx-4 border-b border-edge" data-testid="biggest-expenses">
      {rows.map(({ amount, entry }) => {
        const r = entryRow(entry, catalog.value);
        const day = new Date(Date.parse(entry.occurred_at.slice(0, 10))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        return (
          <li key={entry.id} className="border-t border-edge">
            <button type="button" onClick={() => onOpen(entry)} className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-70">
              <span aria-hidden="true" className="text-[19px]">{r.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px]">{r.title}</span>
                <span className="block truncate text-[13px] text-muted">{day}</span>
              </span>
              <span className="num shrink-0 font-semibold">{formatMoney(amount, currency)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
