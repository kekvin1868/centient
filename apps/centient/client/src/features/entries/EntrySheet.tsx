// Open an entry: edit it (your own entries; the sheet only saves) or see a system entry's details.
// deleteWithUndo (used by the row's swipe action) hides it at once and offers Undo for 5 s; the delete
// request is sent only when the Undo window ends.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { fromCommand, toCommand, type Form } from './form';
import { formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { catalog, hiddenEntries, nameOf } from '../../lib/state';
import type { Entry } from './EntryList';
import { EntryForm } from './EntryForm';
import { PaidBackSheet } from './PaidBackSheet';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { errorText } from '../../lib/run';
import { BillPeople } from './BillPeople';
import { TiedSheet } from './TiedSheet';
import { entryApi, type PaybackMode } from '../../models/entry';
import { persist } from '../../models/query';

/** `paybacks`: a bill with Paid backs tied, as answered in TiedSheet. */
export function deleteWithUndo(id: string, paybacks?: PaybackMode) {
  const hide = (on: boolean) => {
    const next = new Set(hiddenEntries.value);
    if (on) next.add(id);
    else next.delete(id);
    hiddenEntries.value = next;
  };
  hide(true);
  showToast('Deleted', {
    action: { label: 'Undo', run: () => hide(false) },
    onExpire: async () => {
      await persist(() => entryApi.remove(id, paybacks));
      hide(false);
    },
  });
}

/** Render with key={entry id}: the form is set up once per opened entry. */
export function EntrySheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [form, setForm] = useState<Form | null>(
    entry?.command ? fromCommand(entry.command, id => nameOf(catalog.value.accounts, id)) : null,
  );
  // The edit leaves someone's Paid backs over their new share: ask what happened to that money.
  const [tied, setTied] = useState(false);
  if (!entry) return null;
  // A payback from a person's tab opens the sheet it was made in.
  const c = entry.command;
  if (
    c?.type === 'TRANSFER' &&
    catalog.value.accounts.find(x => x.id === c.fromAccountId)?.kind === 'IOU'
  )
    return <PaidBackSheet tabId={c.fromAccountId} mode="PAID" entry={entry} onClose={onClose} />;
  const row = entryRow(entry, catalog.value);
  const result = form ? toCommand(form) : null;

  const save = async (paybacks?: PaybackMode) => {
    if (!result || 'error' in result) return;
    let asked = false;
    const ok = await persist(
      () => entryApi.edit(entry.id, result.command, paybacks),
      undefined,
      e => {
        if ((e as { code?: string }).code === 'PAYBACKS_TIED') asked = true;
        else showToast(errorText(e));
      },
    );
    if (asked) return setTied(true);
    if (ok) {
      onClose();
      showToast('Saved');
    }
  };

  return (
    // Deleting lives on the row (swipe left, or focus its actions), so editing only saves.
    <Sheet open onClose={onClose} title={form ? 'Edit' : row.title}>
      {form ? (
        <>
          <EntryForm form={form} onChange={setForm} lockType />
          {entry.people?.length ? (
            <Group label="Paid back so far">
              <li className="pt-3">
                <BillPeople
                  bill={entry.command}
                  people={entry.people}
                  currency={row.currency}
                  all
                />
              </li>
            </Group>
          ) : null}
          <Block>
            <Button large rounded disabled={'error' in (result ?? {})} onClick={() => save()}>
              {result && 'error' in result ? result.error : 'Save'}
            </Button>
          </Block>
          <TiedSheet
            open={tied}
            title={`Save ${row.title}? Someone paid back more than this leaves them.`}
            people={entry.people ?? []}
            currency={row.currency}
            onCancel={() => setTied(false)}
            onPick={mode => {
              setTied(false);
              save(mode);
            }}
          />
        </>
      ) : (
        <Group
          foot={`${entry.kind === 'OPENING' ? 'To change it, use Update balance on the Money tab.' : 'Corrections come from Update balance on the Money tab.'} Swipe the row left to delete it.`}
        >
          <Row title={row.sub || row.title} trail={formatMoney(row.amount, row.currency)} />
        </Group>
      )}
    </Sheet>
  );
}
