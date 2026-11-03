// Settings: accounts, pockets, categories, hidden items, when the month starts, backup and reset. "Hide"
// keeps history; deleting an account or resetting flags data as deleted rather than erasing it.
import { useState } from 'react';
import type { Account } from '../../../src/repos/accounts';
import type { Category } from '../../../src/repos/categories';
import type { Envelope } from '../../../src/repos/envelopes';
import { AccountForm } from '../features/accounts/AccountForm';
import { ForecastStart } from '../features/budgets/ForecastStart';
import { EditAccountSheet } from '../features/accounts/EditAccountSheet';
import { AddCategorySheet } from '../features/categories/AddCategorySheet';
import { EditCategorySheet } from '../features/categories/EditCategorySheet';
import { AddPocketSheet } from '../features/pockets/AddPocketSheet';
import { EditPocketSheet } from '../features/pockets/EditPocketSheet';
import { HiddenItems } from '../features/workspace/HiddenItems';
import { MonthStart } from '../features/workspace/MonthStart';
import { ResetSheet } from '../features/workspace/ResetSheet';
import { Page } from '../layouts/Page';
import { downloadBackup } from '../lib/backup';
import { ACCOUNT_KINDS, POCKET_KINDS } from '../lib/format';
import { categoryEmoji } from '../lib/labels';
import { attempt } from '../lib/run';
import { active, catalog, nameOf } from '../lib/state';
import { Group, Row } from '../ui/List';
import { Sheet } from '../ui/Sheet';

export function Settings() {
  const [account, setAccount] = useState<Account | null>(null);
  const [pocket, setPocket] = useState<Envelope | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [add, setAdd] = useState<'account' | 'pocket' | 'category' | null>(null);
  const [reset, setReset] = useState(false);
  const cat = catalog.value;
  const close = () => setAdd(null);

  return (
    <Page title="Settings">
      <Group label="Accounts">
        {active(cat.accounts).map(a => <Row key={a.id} title={a.name} sub={`${ACCOUNT_KINDS[a.kind]}${a.currency_code !== 'IDR' ? ` · ${a.currency_code}` : ''}`} chevron onClick={() => setAccount(a)} />)}
        <Row title={<span className="text-primary">Add account</span>} onClick={() => setAdd('account')} />
      </Group>

      <Group label="Pockets" foot="Pockets live inside an account and set some of its money aside. New money lands in the account's balance; move it into pockets, or to another account, on the Money tab.">
        {active(cat.envelopes).filter(e => !cat.accounts.some(a => a.default_envelope_id === e.id)).map(e => (
          <Row key={e.id} title={e.name} sub={`${nameOf(cat.accounts, e.account_id)} · ${POCKET_KINDS[e.kind]}`} chevron onClick={() => setPocket(e)} />
        ))}
        <Row title={<span className="text-primary">Add pocket</span>} onClick={() => setAdd('pocket')} />
      </Group>

      <Group label="Categories">
        {active(cat.categories).filter(c => !['Balance adjustment', 'Opening balance'].includes(c.name)).map(c => (
          <Row key={c.id} title={`${categoryEmoji(c.name, c.kind)} ${c.name}`} sub={c.kind === 'EXPENSE' ? 'Spending' : 'Income'} chevron onClick={() => setCategory(c)} />
        ))}
        <Row title={<span className="text-primary">Add category</span>} onClick={() => setAdd('category')} />
      </Group>

      <HiddenItems />
      <MonthStart />
      <ForecastStart />

      <Group label="Your data">
        <Row title="Download all as spreadsheet (CSV)" chevron onClick={() => location.assign('/api/export.csv')} />
        <Row title="Download a backup" sub="Everything, as one file you can keep" chevron onClick={() => attempt(downloadBackup)} />
      </Group>

      <Group>
        <Row title={<span className="k-color-brand-red font-semibold text-primary">Reset Centient</span>} onClick={() => setReset(true)} />
      </Group>

      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <ResetSheet open={reset} onClose={() => setReset(false)} />
      <EditAccountSheet key={`account:${account?.id ?? 'none'}`} account={account} onClose={() => setAccount(null)} />
      <EditPocketSheet key={`pocket:${pocket?.id ?? 'none'}`} pocket={pocket} onClose={() => setPocket(null)} />
      <EditCategorySheet key={`category:${category?.id ?? 'none'}`} category={category} onClose={() => setCategory(null)} />
      <Sheet open={add === 'account'} onClose={close} title="Add account"><AccountForm onDone={close} /></Sheet>
      <AddPocketSheet key={`add-pocket:${add === 'pocket'}`} open={add === 'pocket'} onClose={close} />
      <AddCategorySheet key={`add-category:${add === 'category'}`} open={add === 'category'} onClose={close} />
    </Page>
  );
}
