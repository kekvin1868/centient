// Accounts & pockets (a page of the Menu): every account and pocket, opening their sheets, and adding one.
import { useState } from 'react';
import type { Account } from '../../../src/repos/accounts';
import type { Envelope } from '../../../src/repos/envelopes';
import { AccountForm } from '../features/accounts/AccountForm';
import { EditAccountSheet } from '../features/accounts/EditAccountSheet';
import { AddPocketSheet } from '../features/pockets/AddPocketSheet';
import { EditPocketSheet } from '../features/pockets/EditPocketSheet';
import { Page, type Back } from '../layouts/Page';
import { ACCOUNT_KINDS, POCKET_KINDS } from '../lib/format';
import { active, catalog, nameOf } from '../lib/state';
import { Group, Row } from '../ui/List';
import { Sheet } from '../ui/Sheet';

export function AccountsPage({ back }: { back: Back }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [pocket, setPocket] = useState<Envelope | null>(null);
  const [add, setAdd] = useState<'account' | 'pocket' | null>(null);
  const cat = catalog.value;
  const close = () => setAdd(null);

  return (
    <Page title="Accounts & pockets" back={back}>
      <Group label="Accounts">
        {active(cat.accounts).map(a => (
          <Row
            key={a.id}
            title={a.name}
            sub={`${ACCOUNT_KINDS[a.kind]}${a.currency_code !== 'IDR' ? ` · ${a.currency_code}` : ''}`}
            chevron
            onClick={() => setAccount(a)}
          />
        ))}
        <Row
          title={<span className="text-primary">Add account</span>}
          onClick={() => setAdd('account')}
        />
      </Group>

      <Group
        label="Pockets"
        foot="Pockets live inside an account and set some of its money aside. New money lands in the account's balance; move it into pockets, or to another account, on the Money tab."
      >
        {active(cat.envelopes)
          .filter(e => !cat.accounts.some(a => a.default_envelope_id === e.id))
          .map(e => (
            <Row
              key={e.id}
              title={e.name}
              sub={`${nameOf(cat.accounts, e.account_id)} · ${POCKET_KINDS[e.kind]}`}
              chevron
              onClick={() => setPocket(e)}
            />
          ))}
        <Row
          title={<span className="text-primary">Add pocket</span>}
          onClick={() => setAdd('pocket')}
        />
      </Group>

      {/* Sheets are keyed by what they show, so each opening starts from fresh state set at mount. */}
      <EditAccountSheet
        key={`account:${account?.id ?? 'none'}`}
        account={account}
        onClose={() => setAccount(null)}
      />
      <EditPocketSheet
        key={`pocket:${pocket?.id ?? 'none'}`}
        pocket={pocket}
        onClose={() => setPocket(null)}
      />
      <Sheet open={add === 'account'} onClose={close} title="Add account">
        <AccountForm onDone={close} />
      </Sheet>
      <AddPocketSheet
        key={`add-pocket:${add === 'pocket'}`}
        open={add === 'pocket'}
        onClose={close}
      />
    </Page>
  );
}
