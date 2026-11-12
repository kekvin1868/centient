// Home: what you can still spend (the HUD), installments due soon, the log box, then what waits under it (so
// nothing pushes the log box off the screen): payments in the Inbox and bills coming up, and recent activity.
import { useState } from 'react';
import { AccountChip } from '../features/accounts/AccountChip';
import { AccountPicker } from '../features/accounts/AccountPicker';
import { ReturnDue } from '../features/accounts/ReturnDue';
import { Headline } from '../features/budgets/Headline';
import { AllActivity } from '../features/entries/AllActivity';
import type { Entry } from '../features/entries/EntryList';
import { EntrySheet } from '../features/entries/EntrySheet';
import { LogBox } from '../features/entries/LogBox';
import { Recent } from '../features/entries/Recent';
import { InboxLazy } from '../features/inbox/InboxLazy';
import { InboxNotice } from '../features/inbox/InboxNotice';
import { DueSoon } from '../features/installments/DueSoon';
import { ComingUp } from '../features/recurring/ComingUp';
import { SubscriptionsLazy } from '../features/recurring/SubscriptionsLazy';
import { Page } from '../layouts/Page';
import { Logo } from '../ui/Logo';

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
      <InboxNotice onOpen={() => setInbox(true)} />
      <ComingUp onOpen={() => setSubscriptions(true)} />
      <Recent onOpen={setOpen} onSeeAll={() => setAll(true)} />
      <AccountPicker open={picking} onClose={() => setPicking(false)} />
      <InboxLazy open={inbox} onClose={() => setInbox(false)} />
      <SubscriptionsLazy open={subscriptions} onClose={() => setSubscriptions(false)} />
      <AllActivity open={all} onClose={() => setAll(false)} onOpen={setOpen} />
      <EntrySheet key={`entry:${open?.id ?? 'none'}`} entry={open} onClose={() => setOpen(null)} />
    </Page>
  );
}
