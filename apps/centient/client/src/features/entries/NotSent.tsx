// Home, under the log box, only while a change needs the owner: the server refused it, or the entry was changed
// somewhere else (models/outbox). They are listed here whatever their date, so none is forgotten.
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
        {o.problems} entr{o.problems === 1 ? 'y was' : 'ies were'} not sent. Tap one to fix it.
      </Banner>
      <EntryList entries={rows} onOpen={onOpen} empty="" />
    </section>
  );
}
