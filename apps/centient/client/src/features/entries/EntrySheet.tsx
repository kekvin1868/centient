// Open an entry: edit it (your own entries; the sheet only saves) or see a system entry's details.
// deleteWithUndo (used by the row's swipe action) hides it at once and offers Undo for 5 s; the delete is
// queued only when the Undo window ends.
// Saves go through the outbox (models/outbox), so they work with no signal. An entry the server refused opens
// with its reason, Send again and Discard; one changed somewhere else opens ClashSheet.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { fromCommand, toCommand, type Form } from './form';
import { formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { catalog, hiddenEntries, nameOf } from '../../lib/state';
import type { Entry } from './EntryList';
import { ClashSheet } from './ClashSheet';
import { EntryForm } from './EntryForm';
import { PaidBackSheet } from './PaidBackSheet';
import { Banner } from '../../ui/Banner';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { BillPeople } from './BillPeople';
import { TiedSheet } from './TiedSheet';
import { entryApi, type PaybackMode } from '../../models/entry';
import { outbox } from '../../models/outbox';
import { leavesPaybacksOver } from '../../models/useWaiting';

/** `paybacks`: a bill with Paid backs tied, as answered in TiedSheet. */
export function deleteWithUndo(entry: Entry, paybacks?: PaybackMode) {
  const hide = (on: boolean) => {
    const next = new Set(hiddenEntries.value);
    if (on) next.add(entry.id);
    else next.delete(entry.id);
    hiddenEntries.value = next;
  };
  hide(true);
  showToast('Deleted', {
    action: { label: 'Undo', run: () => hide(false) },
    onExpire: () => {
      // From here the outbox hides it (and brings it back, marked, if the server refuses).
      entryApi.remove(entry, paybacks);
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
  const mark = entry.waiting;
  if (mark?.state === 'clash') return <ClashSheet entry={entry} onClose={onClose} />;
  // A payback from a person's tab opens the sheet it was made in.
  const c = entry.command;
  if (
    c?.type === 'TRANSFER' &&
    catalog.value.accounts.find(x => x.id === c.fromAccountId)?.kind === 'IOU'
  )
    return <PaidBackSheet tabId={c.fromAccountId} mode="PAID" entry={entry} onClose={onClose} />;
  const row = entryRow(entry, catalog.value);
  const result = form ? toCommand(form) : null;
  const refused = mark?.state === 'refused';
  const discard = () => {
    outbox.discard(entry.id);
    onClose();
    showToast(mark?.op === 'create' ? 'Discarded' : 'Change dropped');
  };

  const save = async (paybacks?: PaybackMode) => {
    if (!result || 'error' in result) return;
    const { command } = result;
    const ok = await attempt(async () => {
      // Asked before the edit is queued: by the time it is sent the sheet is long closed.
      if (!paybacks && (await leavesPaybacksOver(entry, command))) return setTied(true);
      await entryApi.edit(entry, command, paybacks);
      onClose();
      showToast('Saved');
    });
    if (!ok) setTied(false);
  };

  return (
    // Deleting lives on the row (swipe left, or focus its actions), so editing only saves.
    <Sheet open onClose={onClose} title={form ? (refused ? 'Not sent' : 'Edit') : row.title}>
      {refused && (
        <Banner>
          {mark.reason ?? 'The server refused this.'} Fix it and send again, or discard it.
        </Banner>
      )}
      {refused && mark.op === 'remove' ? (
        <Block className="space-y-3">
          <Button
            large
            rounded
            onClick={() => {
              outbox.resend(entry.id);
              onClose();
            }}
          >
            Try deleting again
          </Button>
          <Button large rounded tonal onClick={discard}>
            Keep the entry
          </Button>
        </Block>
      ) : form ? (
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
          <Block className="space-y-3">
            <Button large rounded disabled={'error' in (result ?? {})} onClick={() => save()}>
              {result && 'error' in result ? result.error : refused ? 'Send again' : 'Save'}
            </Button>
            {refused && (
              <Button large rounded tonal onClick={discard}>
                Discard
              </Button>
            )}
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
