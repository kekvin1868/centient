// Open an entry: edit it (your own entries) or see a system entry's details, and delete it (as the row's swipe
// does: asked first, or what to do with Paid backs tied to it; then 5 s to undo, ./deleteWithUndo). Loaded when an
// entry is opened, not for the first paint.
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
import { deleteWithUndo } from './deleteWithUndo';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { EntryForm } from './EntryForm';
import { useLimitGate } from './limitGate';
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

/** Render with key={entry id}: the form is set up once per opened entry. */
export function EntrySheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const [form, setForm] = useState<Form | null>(
    entry?.command ? fromCommand(entry.command, id => nameOf(catalog.value.accounts, id)) : null,
  );
  // The edit leaves someone's Paid backs over their new share: ask what happened to that money.
  const [tied, setTied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delTied, setDelTied] = useState(false);
  const was = entry?.command;
  const { gate, sheet } = useLimitGate(
    was?.type === 'EXPENSE' ? { accountId: was.accountId, amount: was.amount } : undefined,
  );
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

  const save = async (paybacks?: PaybackMode, f: Form | null = form) => {
    const result = f ? toCommand(f) : null;
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

  // Delete, the same way the row's swipe does: Paid backs tied to it ask what happened to them, else confirm.
  const askDelete = () =>
    entry.people?.some(p => p.paybacks.length) ? setDelTied(true) : setDeleting(true);
  const remove = (paybacks?: PaybackMode) => {
    setDeleting(false);
    setDelTied(false);
    onClose();
    deleteWithUndo(entry, paybacks);
  };
  const deleteParts = (
    <>
      <Block>
        <Button large rounded tonal className="k-color-brand-red" onClick={askDelete}>
          Delete
        </Button>
      </Block>
      <ConfirmSheet
        open={deleting}
        message={`Delete ${row.title}, ${formatMoney(row.amount, row.currency)}?`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove()}
      />
      <TiedSheet
        open={delTied}
        title={`Delete ${row.title}?`}
        people={entry.people ?? []}
        currency={row.currency}
        onCancel={() => setDelTied(false)}
        onPick={remove}
      />
    </>
  );

  return (
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
          <EntryForm
            form={form}
            onChange={setForm}
            lockType
            before={
              was?.type === 'EXPENSE' ? { accountId: was.accountId, amount: was.amount } : undefined
            }
          />
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
            <Button
              large
              rounded
              disabled={'error' in (result ?? {})}
              onClick={() =>
                void gate([form], ([f]) => {
                  setForm(f);
                  void save(undefined, f);
                })
              }
            >
              {result && 'error' in result ? result.error : refused ? 'Send again' : 'Save'}
            </Button>
            {refused && (
              <Button large rounded tonal onClick={discard}>
                Discard
              </Button>
            )}
          </Block>
          {!refused && deleteParts}
          {sheet}
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
          foot={`${entry.kind === 'OPENING' ? 'To change it, use Update balance on the Money tab.' : 'Corrections come from Update balance on the Money tab.'}`}
        >
          <Row title={row.sub || row.title} trail={formatMoney(row.amount, row.currency)} />
        </Group>
      )}
      {!form && !refused && deleteParts}
    </Sheet>
  );
}
