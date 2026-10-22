// Home: what you can still spend (the HUD), installments due soon, the log box, and recent activity.
import { useState } from 'react';
import { AccountChip } from '../features/accounts/AccountChip';
import { AccountPicker } from '../features/accounts/AccountPicker';
import { Headline } from '../features/budgets/Headline';
import { AllActivity } from '../features/entries/AllActivity';
import type { Entry } from '../features/entries/EntryList';
import { EntrySheet } from '../features/entries/EntrySheet';
import { LogBox } from '../features/entries/LogBox';
import { Recent } from '../features/entries/Recent';
import { DueSoon } from '../features/installments/DueSoon';
import { Page } from '../layouts/Page';
import { Logo } from '../ui/Logo';

export function Home({ onGoMoney }: { onGoMoney: () => void }) {
  const [open, setOpen] = useState<Entry | null>(null);
  const [all, setAll] = useState(false);
  const [picking, setPicking] = useState(false);
  return (
    <Page>
      <div className="flex items-center justify-between gap-3 px-4 pt-1">
        <h1><Logo height={30} className="text-ink" /></h1>
        <AccountChip onOpen={() => setPicking(true)} />
      </div>
      <Headline onGoMoney={onGoMoney} />
      <DueSoon onGo={onGoMoney} />
      <LogBox />
      <Recent onOpen={setOpen} onSeeAll={() => setAll(true)} />
      <AccountPicker open={picking} onClose={() => setPicking(false)} />
      <AllActivity open={all} onClose={() => setAll(false)} onOpen={setOpen} />
      <EntrySheet key={`entry:${open?.id ?? 'none'}`} entry={open} onClose={() => setOpen(null)} />
    </Page>
  );
}
