// Home: what you can still spend (the HUD), the log box, then what waits under it (so
// nothing pushes the log box off the screen): payments in the Inbox and bills coming up, and recent activity.
import { useState } from 'react';
import { AccountChip } from '../features/accounts/AccountChip';
import { ReturnDue } from '../features/accounts/ReturnDue';
import { Headline } from '../features/budgets/Headline';
import type { Entry } from '../features/entries/EntryList';
import { LogBox } from '../features/entries/LogBox';
import { NotSent } from '../features/entries/NotSent';
import { Recent } from '../features/entries/Recent';
import { InboxNotice } from '../features/inbox/InboxNotice';
import { PhotoButton } from '../features/inbox/PhotoButton';
import { ComingUp } from '../features/recurring/ComingUp';
import { Page } from '../layouts/Page';
import { lazySheet } from '../ui/lazySheet';
import { Logo } from '../ui/Logo';

// Sheets a tap opens are downloaded then, not with Home (its first paint has a size budget).
const Inbox = lazySheet(() => import('./Inbox').then(m => m.Inbox));
const AccountPicker = lazySheet(() =>
  import('../features/accounts/AccountPicker').then(m => m.AccountPicker),
);
const AllActivity = lazySheet(() =>
  import('../features/entries/AllActivity').then(m => m.AllActivity),
);
const EntrySheet = lazySheet(() =>
  import('../features/entries/EntrySheet').then(
    m =>
      function OpenEntry(p: { open: boolean; entry: Entry | null; onClose: () => void }) {
        return <m.EntrySheet entry={p.entry} onClose={p.onClose} />;
      },
  ),
);

export function Home({ onGoMoney, onGoBills }: { onGoMoney: () => void; onGoBills: () => void }) {
  const [open, setOpen] = useState<Entry | null>(null);
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const [inbox, setInbox] = useState(false);
  return (
    <Page>
      <div className="flex items-center justify-between gap-3 px-4 pt-1">
        <h1>
          <Logo height={30} className="text-ink" />
        </h1>
        <AccountChip onOpen={() => setPicking(true)} />
      </div>
      <Headline onGoMoney={onGoMoney} />
      <ReturnDue onGo={onGoMoney} />
      <LogBox />
      <NotSent onOpen={setOpen} />
      <PhotoButton onCaptured={() => setInbox(true)} />
      <InboxNotice onOpen={() => setInbox(true)} />
      <ComingUp onOpen={onGoBills} />
      <Recent onOpen={setOpen} onSeeAll={() => setAll(true)} />
      <AccountPicker open={picking} onClose={() => setPicking(false)} />
      <Inbox open={inbox} onClose={() => setInbox(false)} />
      <AllActivity open={all} onClose={() => setAll(false)} onOpen={setOpen} />
      <EntrySheet
        key={`entry:${open?.id ?? 'none'}`}
        open={Boolean(open)}
        entry={open}
        onClose={() => setOpen(null)}
      />
    </Page>
  );
}
