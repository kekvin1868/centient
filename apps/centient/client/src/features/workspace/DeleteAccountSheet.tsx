// Delete everything, for good: every entry, account, file and setting on the server, not just flagged like a
// reset. A backup is offered first, and the word DELETE has to be typed.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { downloadBackup } from '../../lib/backup';
import { rememberLock } from '../../lib/lockState';
import { attempt } from '../../lib/run';
import { persister, queryClient } from '../../models/query';
import { workspaceApi } from '../../models/workspace';
import { InputRow, ToggleRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';

const WORD = 'DELETE';

export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [backup, setBackup] = useState(true);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      if (backup) await downloadBackup();
      await workspaceApi.purge(typed);
    });
    setBusy(false);
    if (!ok) return;
    // Nothing of it stays on this device either: saved data, and the lock that went with the account.
    queryClient.clear();
    await persister.removeClient();
    rememberLock(false);
    location.assign('/');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Delete everything">
      <p className="mx-4 my-4 text-muted">
        This erases your accounts, entries, Pockets, budgets, bills, files and the app lock from the
        server, including what earlier resets left behind. It cannot be undone, and no copy is kept.
        Signing in again starts from the first screen.
      </p>
      <Group foot={`Type ${WORD} to go on.`}>
        <ToggleRow label="Download a backup first" checked={backup} onChange={setBackup} />
        <InputRow label="Confirm" value={typed} placeholder={WORD} onInput={setTyped} />
      </Group>
      <Block className="flex flex-col gap-2.5">
        <Button
          large
          rounded
          className="k-color-brand-red"
          disabled={busy || typed !== WORD}
          onClick={run}
        >
          {busy ? 'Deleting…' : 'Delete everything for good'}
        </Button>
        <Button large rounded tonal onClick={onClose}>
          Cancel
        </Button>
      </Block>
    </Sheet>
  );
}
