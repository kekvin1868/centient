// Security & Data (a page of the Menu): the app lock, downloads of your data, reset and delete everything.
// Resetting flags data as deleted rather than erasing it; Delete everything erases it from the server too.
import { useState } from 'react';
import { LockSettings } from '../features/lock/LockSettings';
import { DeleteAccountSheet } from '../features/workspace/DeleteAccountSheet';
import { ResetSheet } from '../features/workspace/ResetSheet';
import { Page, type Back } from '../layouts/Page';
import { downloadBackup } from '../lib/backup';
import { attempt } from '../lib/run';
import { Group, Row } from '../ui/List';

export function SecurityPage({ back }: { back: Back }) {
  const [reset, setReset] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <Page title="Security & Data" back={back}>
      <LockSettings />

      <Group label="Your data">
        <Row
          title="Download all as spreadsheet (CSV)"
          chevron
          onClick={() => location.assign('/api/export.csv')}
        />
        <Row
          title="Download a backup"
          sub="Everything, as one file you can keep"
          chevron
          onClick={() => attempt(downloadBackup)}
        />
      </Group>

      <Group>
        <Row
          title={
            <span className="k-color-brand-red font-semibold text-primary">Reset Centient</span>
          }
          onClick={() => setReset(true)}
        />
        <Row
          title={
            <span className="k-color-brand-red font-semibold text-primary">Delete everything</span>
          }
          sub="For good, from the server too"
          onClick={() => setDeleting(true)}
        />
      </Group>

      <ResetSheet open={reset} onClose={() => setReset(false)} />
      <DeleteAccountSheet
        key={`delete:${deleting}`}
        open={deleting}
        onClose={() => setDeleting(false)}
      />
    </Page>
  );
}
