// Home: what you can still spend (the HUD), installments due soon, the log box, then what waits under it (so
// nothing pushes the log box off the screen): payments in the Inbox and bills coming up, and recent activity.
import { useState } from 'react';
import { AccountChip } from '../features/accounts/AccountChip';
import { ReturnDue } from '../features/accounts/ReturnDue';
import { Headline } from '../features/budgets/Headline';
import type { Entry } from '../features/entries/EntryList';
import { EntrySheet } from '../features/entries/EntrySheet';
import { LogBox } from '../features/entries/LogBox';
import { NotSent } from '../features/entries/NotSent';
import { Recent } from '../features/entries/Recent';
import { InboxNotice } from '../features/inbox/InboxNotice';
import { PhotoButton } from '../features/inbox/PhotoButton';
import { DueSoon } from '../features/installments/DueSoon';
import { ComingUp } from '../features/recurring/ComingUp';
import { SubscriptionsLazy } from '../features/recurring/SubscriptionsLazy';
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

export function Home({ onGoMoney }: { onGoMoney: () => void }) {
  const [open, setOpen] = useState<Entry | null>(null);
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(false);
  const [subscriptions, setSubscriptions] = useState(false);
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
      <DueSoon onGo={onGoMoney} />
      <ReturnDue onGo={onGoMoney} />
      <LogBox />
      <NotSent onOpen={setOpen} />
      <PhotoButton onCaptured={() => setInbox(true)} />
      <InboxNotice onOpen={() => setInbox(true)} />
      <ComingUp onOpen={() => setSubscriptions(true)} />
      <Recent onOpen={setOpen} onSeeAll={() => setAll(true)} />
      <AccountPicker open={picking} onClose={() => setPicking(false)} />
      <Inbox open={inbox} onClose={() => setInbox(false)} />
      <SubscriptionsLazy open={subscriptions} onClose={() => setSubscriptions(false)} />
      <AllActivity open={all} onClose={() => setAll(false)} onOpen={setOpen} />
      <EntrySheet key={`entry:${open?.id ?? 'none'}`} entry={open} onClose={() => setOpen(null)} />
    </Page>
  );
}
