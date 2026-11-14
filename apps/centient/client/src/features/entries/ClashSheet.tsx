// An edit made on this phone met an entry that was changed somewhere else meanwhile (models/outbox, state
// `clash`). Nothing was overwritten: both versions are shown and the owner picks one.
import { Block, Button } from 'konsta/react';
import { dayLabel, formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { catalog, me } from '../../lib/state';
import { outbox, outboxItems } from '../../models/outbox';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import type { Entry } from './EntryList';

/** What tells two versions of an entry apart, in the words of its row. */
function facts(e: Entry) {
  const r = entryRow(e, catalog.value);
  return [
    { label: 'Name', value: r.title },
    { label: 'Amount', value: formatMoney(r.amount, r.currency) },
    { label: 'Details', value: r.sub ?? '' },
    { label: 'Day', value: dayLabel(e.occurred_at.slice(0, 10), me.value?.today ?? '') },
  ];
}

const Fact = ({ value, differs }: { value: string; differs: boolean }) => (
  <span className={differs ? 'font-bold text-primary' : undefined}>
    {differs && <span className="sr-only">Differs: </span>}
    {value || '-'}
  </span>
);

export function ClashSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const item = outboxItems.value.find(i => i.entryId === entry.id && i.state === 'clash');
  const mine = facts(entry);
  const theirs = item?.theirs ? facts(item.theirs) : null;
  const done = (words: string) => {
    onClose();
    showToast(words);
  };
  return (
    <Sheet open onClose={onClose} title="Changed elsewhere">
      <Group
        label="Yours, from this phone"
        foot="This entry was changed somewhere else while your edit was waiting. Nothing was overwritten."
      >
        {mine.map((f, i) => (
          <Row
            key={f.label}
            title={f.label}
            // What differs is what the choice is about.
            trail={
              <Fact value={f.value} differs={Boolean(theirs && theirs[i].value !== f.value)} />
            }
          />
        ))}
      </Group>
      <Group label="Now, on the server">
        {theirs ? (
          theirs.map((f, i) => (
            <Row
              key={f.label}
              title={f.label}
              trail={<Fact value={f.value} differs={mine[i].value !== f.value} />}
            />
          ))
        ) : (
          <Row title="Could not load it. Keep mine saves your edit over it." />
        )}
      </Group>
      <Block className="space-y-3">
        <Button
          large
          rounded
          onClick={() => {
            outbox.keepMine(entry.id);
            done('Keeping yours');
          }}
        >
          Keep mine
        </Button>
        <Button
          large
          rounded
          tonal
          onClick={() => {
            outbox.discard(entry.id);
            done('Kept as it is on the server');
          }}
        >
          Keep theirs
        </Button>
      </Block>
    </Sheet>
  );
}
