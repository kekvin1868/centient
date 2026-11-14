// Start over. Optionally downloads a backup first; the old data stays on the server, flagged as deleted.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { downloadBackup } from '../../lib/backup';
import { attempt } from '../../lib/run';
import { ToggleRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { outbox } from '../../models/outbox';
import { persister, queryClient } from '../../models/query';
import { workspaceApi } from '../../models/workspace';

export function ResetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      if (backup) await downloadBackup();
      await workspaceApi.reset();
    });
    setBusy(false);
    if (!ok) return;
    // A clean start: forget the data kept on this device, then reload into the fresh workspace.
    queryClient.clear();
    outbox.clear();
    await persister.removeClient();
    location.assign('/');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Reset Centient">
      <p className="mx-4 my-4 text-muted">
        This removes your accounts, entries, Pockets, categories and budgets from the app, and you
        start again from the first screen. A copy stays on the server, marked as deleted.
      </p>
      <Group>
        <ToggleRow label="Download a backup first" checked={backup} onChange={setBackup} />
      </Group>
      <Block className="flex flex-col gap-2.5">
        <Button large rounded className="k-color-brand-red" disabled={busy} onClick={run}>
          {busy ? 'Resetting…' : 'Reset Centient'}
        </Button>
        <Button large rounded tonal onClick={onClose}>
          Cancel
        </Button>
      </Block>
    </Sheet>
  );
}
