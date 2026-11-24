// Home, under the log box, only while a change needs the owner: the server refused it, or the entry was changed
// somewhere else (models/outbox). They are listed here whatever their date, so none is forgotten. A refused card
// statement ("Enter statement") is listed too, with its reason and Discard (it is typed again on the new bill).
import { catalog, nameOf } from '../../lib/state';
import { billMonth } from '../../models/dates';
import { outbox } from '../../models/outbox';
import { waiting } from '../../models/useWaiting';
import { Banner } from '../../ui/Banner';
import { EntryList, type Entry } from './EntryList';

export function NotSent({ onOpen }: { onOpen: (e: Entry) => void }) {
  const o = waiting.value;
  if (!o.problems) return null;
  const rows = o.entries.filter(e => e.waiting.state === 'refused' || e.waiting.state === 'clash');
  return (
    <section aria-label="Not sent">
      <Banner>
        {o.problems} change{o.problems === 1 ? ' was' : 's were'} not sent. Tap one to fix it.
      </Banner>
      {o.statements.length > 0 && (
        <ul className="mx-4 my-2" aria-label="Statements not sent">
          {o.statements.map(i => (
            <li
              key={i.key}
              className="flex items-center gap-3 border-b border-edge py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-[15px]">
                {nameOf(catalog.value.accounts, i.statement!.accountId)} statement ·{' '}
                {billMonth(i.statement!.closedOn.slice(0, 7))} bill
                <span className="block text-[13px] text-negative">{i.reason}</span>
              </span>
              <button
                type="button"
                className="keycap keycap-quiet !rounded-[3px] !text-[12px]"
                onClick={() => outbox.discard(i.entryId)}
              >
                DISCARD
              </button>
            </li>
          ))}
        </ul>
      )}
      <EntryList entries={rows} onOpen={onOpen} empty="" />
    </section>
  );
}
