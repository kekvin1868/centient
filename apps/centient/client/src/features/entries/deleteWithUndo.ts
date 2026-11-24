// The row's swipe delete: hides the entry at once and offers Undo for 5 s; the delete is queued only when the
// Undo window ends. Apart from EntrySheet so the entry list does not load the edit sheet for the first paint.
import { hiddenEntries } from '../../lib/state';
import { entryApi, type PaybackMode } from '../../models/entry';
import { showToast } from '../../ui/Toast';
import type { Entry } from './EntryList';

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
