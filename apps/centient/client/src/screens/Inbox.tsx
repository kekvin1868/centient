// The Inbox with its Edit: the Inbox sheet (features/inbox) and the entry form (features/entries) composed, so
// a payment can be corrected in the full form before it is added. Home downloads this the first time it opens.
import { useState } from 'react';
import { blankForm, toCommand, type LogItem } from '../features/entries/form';
import { LogSheet } from '../features/entries/LogSheet';
import { InboxSheet } from '../features/inbox/InboxSheet';
import { entryApi } from '../models/entry';
import { inboxApi, type InboxItem } from '../models/inbox';
import { persist } from '../models/query';
import { showToast } from '../ui/Toast';

/** The entry form filled with what the Inbox item holds; whatever it lacks stays empty for the owner. */
const formOf = (item: InboxItem): LogItem => ({
  key: `inbox:${item.id}`,
  text: '',
  form: {
    ...blankForm(item.date, (item.amount ?? -1) < 0 ? 'EXPENSE' : 'INCOME'),
    amount: item.amount === null ? null : Math.abs(item.amount),
    accountId: item.accountId,
    categoryId: item.categoryId,
    merchant: item.merchant ?? '',
    note: item.note ?? '',
  },
  candidates: [],
  askAmount: false,
  askCharged: false,
  rawMerchant: '',
  suggestedMerchant: '',
});

export function Inbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [editing, setEditing] = useState<InboxItem | null>(null);

  const save = async (edited: LogItem) => {
    const made = toCommand(edited.form);
    if (!editing || 'error' in made) return;
    const { command, extra } = made;
    const added = await persist(async () => {
      await inboxApi.add(editing.id, command);
      // A split covered from another account is a second entry of its own (see entries/form `toCommand`).
      if (extra?.length) await entryApi.record({ commands: extra });
    });
    if (!added) return;
    setEditing(null);
    showToast('Added');
  };

  return (
    <>
      <InboxSheet open={open && !editing} onClose={onClose} onEdit={setEditing} />
      {editing && (
        <LogSheet
          key={`inbox-edit:${editing.id}`}
          item={formOf(editing)}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </>
  );
}
