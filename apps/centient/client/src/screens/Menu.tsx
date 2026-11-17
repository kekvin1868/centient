// Menu: the tab bar's last seat, a NieR list of everything that has no seat of its own. Inbox and Import open
// their dialogs; Accounts & pockets, Security & Data and Settings are pages inside it (useSubPage).
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ImportSheet } from '../features/inbox/ImportSheet';
import { Page } from '../layouts/Page';
import { useSubPage } from '../layouts/useSubPage';
import { inboxQueries } from '../models/inbox';
import { NightList, type NightRow } from '../ui/night/NightList';
import { AccountsPage } from './AccountsPage';
import { Inbox } from './Inbox';
import { SecurityPage } from './SecurityPage';
import { Settings } from './Settings';

const ROWS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'import', label: 'Import a spreadsheet' },
  { key: 'accounts', label: 'Accounts & pockets' },
  { key: 'security', label: 'Security & Data' },
  { key: 'settings', label: 'Settings' },
] as const;
type Key = (typeof ROWS)[number]['key'];
type Sub = Exclude<Key, 'inbox' | 'import'>;

export function Menu() {
  const [sub, open, back] = useSubPage<Sub>();
  /** The row the cursor is on: the last one tapped. */
  const [at, setAt] = useState(0);
  const [importing, setImporting] = useState(false);
  const [inbox, setInbox] = useState(false);
  const { data: waiting } = useQuery(inboxQueries.count());

  const toMenu = { label: 'Menu', onBack: back };
  if (sub === 'accounts') return <AccountsPage back={toMenu} />;
  if (sub === 'security') return <SecurityPage back={toMenu} />;
  if (sub === 'settings') return <Settings back={toMenu} />;

  const rows: NightRow[] = ROWS.map(r => ({
    ...r,
    side: r.key === 'inbox' && waiting ? `${waiting} waiting` : undefined,
  }));
  const pick = (i: number) => {
    setAt(i);
    const { key } = ROWS[i];
    if (key === 'inbox') setInbox(true);
    else if (key === 'import') setImporting(true);
    else open(key);
  };

  return (
    <Page title="Menu">
      <NightList
        label="Menu"
        rows={rows}
        selected={at}
        onPick={pick}
        className="mx-4 mt-3 [&_.n-row]:!py-[15px]"
      />
      <ImportSheet
        key={`import:${importing}`}
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => setInbox(true)}
      />
      <Inbox open={inbox} onClose={() => setInbox(false)} />
    </Page>
  );
}
