// Money: the total, accounts as cards (tap one for its balance, actions, pockets and installments), budgets.
import { BlockTitle } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { Account, Envelope } from '../../../src/application/ports';
import { AccountHand } from '../features/accounts/AccountHand';
import { PickedAccount } from '../features/accounts/PickedAccount';
import { TotalBalance } from '../features/accounts/TotalBalance';
import { Budgets } from '../features/budgets/Budgets';
import { InstallmentsSection } from '../features/installments/InstallmentsSection';
import { takesInstallments } from '../features/installments/plans';
import { AccountPockets } from '../features/pockets/AccountPockets';
import { Page } from '../layouts/Page';
import { call, client } from '../lib/api';
import { formatMoney } from '../lib/format';
import { idrValue, loadPrices, prices } from '../lib/prices';
import { attempt } from '../lib/run';
import { selectedAccount, version } from '../lib/state';

type Bal = { accounts: (Account & { balance: number })[]; envelopes: (Envelope & { balance: number })[] };
// Last data shown, so coming back to Money shows it at once while it refreshes.
let cache: Bal | null = null;

export function Money({ onShowAccount }: { onShowAccount: () => void }) {
  const [bal, setBal] = useState<Bal | null>(cache);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    loadPrices();
    attempt(async () => { cache = (await call(client.api.balances.$get())) as Bal; setBal(cache); });
  }, [version.value]);
  if (!bal) return <Page title="Money" />;
  const a = bal.accounts.find(x => x.id === picked) ?? null;

  return (
    <Page title="Money">
      <TotalBalance accounts={bal.accounts} />
      <BlockTitle medium className="!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em]">
        Accounts <span className="ml-1 text-[15px] font-bold text-muted">{bal.accounts.length}</span>
      </BlockTitle>
      <AccountHand selected={picked} onPick={setPicked} pickOnSettle
        cards={bal.accounts.map(x => {
          const v = x.currency_code === 'IDR' ? null : idrValue(x.balance, x.currency_code, prices.value);
          return { id: x.id, name: x.name, kind: x.kind, balance: x.balance, currency: x.currency_code, note: v !== null ? `≈ ${formatMoney(v)}` : undefined };
        })} />
      <PickedAccount account={a} onShow={x => { selectedAccount.value = x.id; onShowAccount(); }}>
        {a && a.kind !== 'IOU' && <AccountPockets key={a.id} account={a} pockets={bal.envelopes.filter(e => e.account_id === a.id)} />}
        {a && takesInstallments(a.kind) && <InstallmentsSection key={a.id} account={a} />}
      </PickedAccount>
      <Budgets />
    </Page>
  );
}
