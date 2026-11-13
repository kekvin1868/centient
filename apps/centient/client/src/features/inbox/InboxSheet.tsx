// The Inbox (a sheet): payments an import or a photo brought in, waiting for your OK. Review them one by one, or add
// every one that matches no saved entry at once. The latest imports are listed with Undo.
import { useQuery } from '@tanstack/react-query';
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { inboxApi, inboxQueries, type InboxImport, type InboxItem } from '../../models/inbox';
import { persist } from '../../models/query';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { dateText } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { WinButton } from '../../ui/WinButton';
import { InboxCard } from './InboxCard';

export function InboxSheet({
  open,
  onClose,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  /** Open a payment in the entry form (the screen composes that form). */
  onEdit: (item: InboxItem) => void;
}) {
  const { data } = useQuery({ ...inboxQueries.list(), enabled: open });
  const [undoing, setUndoing] = useState<InboxImport | null>(null);
  // What "Add all" takes: payments with nothing missing that match no saved entry.
  const unmatched =
    data?.items.filter(
      i => !i.suggested && i.kind === 'TRANSACTION' && i.amount !== null && i.accountId !== null,
    ).length ?? 0;
  const capped = data ? data.items.length < data.waiting : false;

  const addAll = async () => {
    if (await persist(() => inboxApi.addAll())) showToast('Added');
  };
  const undo = async (i: InboxImport) => {
    setUndoing(null);
    if (await persist(() => inboxApi.undoImport(i.id))) showToast('Import undone');
  };

  return (
    <>
      <Sheet open={open && !undoing} onClose={onClose} title="Inbox">
        {data && (
          <>
            <Block>
              <p className="text-[15px]">
                {data.waiting
                  ? `${data.waiting} waiting for your OK${capped ? `, the oldest ${data.items.length} shown` : ''}. Nothing is saved until you add it.`
                  : 'Nothing is waiting. Payments you import or photograph land here first, so you can check them.'}
              </p>
              {unmatched > 0 && (
                <Button large rounded className="mt-3" onClick={addAll}>
                  {capped ? 'Add all without a match' : `Add all ${unmatched} without a match`}
                </Button>
              )}
            </Block>
            <ul className="flex flex-col gap-2 px-4" aria-label="Waiting for review">
              {data.items.map(item => (
                <InboxCard key={`inbox:${item.id}`} item={item} onEdit={onEdit} />
              ))}
            </ul>
            {data.imports.length > 0 && (
              <Group
                label="Imports"
                foot="Undo takes back an import: its rows here and the entries it added."
              >
                {data.imports.map(i => (
                  <Row
                    key={`import:${i.id}`}
                    title={dateText(i.created_at.slice(0, 10))}
                    sub={`${i.rows} rows · ${i.added} added · ${i.review} waiting`}
                    trail={
                      <WinButton label="Undo this import" onClick={() => setUndoing(i)}>
                        Undo
                      </WinButton>
                    }
                  />
                ))}
              </Group>
            )}
          </>
        )}
      </Sheet>
      <ConfirmSheet
        open={Boolean(undoing)}
        message={
          undoing?.added
            ? `Undo this import? The ${undoing.added} entr${undoing.added === 1 ? 'y' : 'ies'} it added will be deleted.`
            : 'Undo this import? It added no entries yet.'
        }
        confirmLabel="Undo import"
        onCancel={() => setUndoing(null)}
        onConfirm={() => undoing && undo(undoing)}
      />
    </>
  );
}
