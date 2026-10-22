// Open an entry: edit it (your own entries) or delete it. Deleting confirms first, then offers Undo for 5 s;
// the delete request is sent only when the Undo window ends.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../api';
import { fromCommand, toCommand, type Form } from '../lib/form';
import { formatMoney } from '../lib/format';
import { entryRow } from '../lib/labels';
import { attempt } from '../lib/run';
import { catalog, hiddenEntries, refresh } from '../state';
import { ConfirmSheet } from './ConfirmSheet';
import type { Entry } from './EntryList';
import { EntryForm } from './EntryForm';
import { Group, Row } from './List';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

export function deleteWithUndo(id: string) {
  const hide = (on: boolean) => {
    const next = new Set(hiddenEntries.value);
    if (on) next.add(id); else next.delete(id);
    hiddenEntries.value = next;
  };
  hide(true);
  showToast('Deleted', {
    action: { label: 'Undo', run: () => hide(false) },
    onExpire: async () => {
      if (await attempt(() => call(client.api.entries[':id'].$delete({ param: { id } })))) await refresh();
      hide(false);
    },
  });
}

/** Render with key={entry id}: the form is set up once per opened entry. */
export function EntrySheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [form, setForm] = useState<Form | null>(entry?.command ? fromCommand(entry.command) : null);
  const [confirm, setConfirm] = useState(false);
  if (!entry) return null;
  const row = entryRow(entry, catalog.value);
  const result = form ? toCommand(form) : null;

  const save = async () => {
    if (!result || 'error' in result) return;
    const ok = await attempt(() => call(client.api.entries[':id'].$patch({ param: { id: entry.id }, json: result.command })));
    if (ok) { onClose(); showToast('Saved'); await refresh(); }
  };

  return (
    <>
      <Sheet open={!confirm} onClose={onClose} title={form ? 'Edit' : row.title}>
        {form ? (
          <>
            <EntryForm form={form} onChange={setForm} lockType />
            <Block className="flex flex-col gap-2.5">
              <Button large rounded disabled={'error' in (result ?? {})} onClick={save}>
                {result && 'error' in result ? result.error : 'Save'}
              </Button>
              <Button large rounded tonal className="k-color-brand-red" onClick={() => setConfirm(true)}>Delete</Button>
            </Block>
          </>
        ) : (
          <>
            <Group foot={entry.kind === 'OPENING' ? 'To change it, use Update balance on the Money tab.' : 'Corrections come from Update balance on the Money tab.'}>
              <Row title={row.sub || row.title} trail={formatMoney(row.amount, row.currency)} />
            </Group>
            <Block><Button large rounded tonal className="k-color-brand-red" onClick={() => setConfirm(true)}>Delete</Button></Block>
          </>
        )}
      </Sheet>
      <ConfirmSheet open={confirm} message={`Delete ${row.title}, ${formatMoney(row.amount, row.currency)}?`} confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); onClose(); deleteWithUndo(entry.id); }} />
    </>
  );
}
