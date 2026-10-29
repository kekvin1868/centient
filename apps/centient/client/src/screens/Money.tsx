// Money: the total, accounts as cards (one is always picked: Home's account, else the first everyday one; picking
// here picks it on Home too), its free balance, actions, pockets and installments, then budgets.
import { BlockTitle } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { Account } from '../../../src/repos/accounts';
import type { Envelope } from '../../../src/repos/envelopes';
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
  const [picked, setPicked] = useState<string | null>(selectedAccount.value);
  useEffect(() => {
    loadPrices();
    attempt(async () => { cache = (await call(client.api.balances.$get())) as Bal; setBal(cache); });
  }, [version.value]);
  if (!bal) return <Page title="Money" />;
  const a = bal.accounts.find(x => x.id === picked) ?? bal.accounts.find(x => x.kind !== 'IOU') ?? bal.accounts[0] ?? null;
  const pockets = a ? bal.envelopes.filter(e => e.account_id === a.id && !e.archived_at) : [];
  // Tapping the picked card again asks to drop it (null); Money always keeps one. Home has no IOU accounts.
  const pick = (id: string | null) => {
    if (!id) return;
    setPicked(id);
    if (bal.accounts.find(x => x.id === id)?.kind !== 'IOU') selectedAccount.value = id;
  };

  return (
    <Page title="Money">
      <TotalBalance accounts={bal.accounts} />
      <BlockTitle medium className="!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em]">Accounts</BlockTitle>
      <AccountHand selected={a?.id ?? null} onPick={pick} pickOnSettle
        cards={bal.accounts.map(x => {
          const v = x.currency_code === 'IDR' ? null : idrValue(x.balance, x.currency_code, prices.value);
          return { id: x.id, name: x.name, kind: x.kind, balance: x.balance, currency: x.currency_code, note: v !== null ? `≈ ${formatMoney(v)}` : undefined };
        })} />
      <PickedAccount account={a} pockets={pockets}
        onShow={x => { selectedAccount.value = x.id; onShowAccount(); }}>
        {a && a.kind !== 'IOU' && <AccountPockets key={`pockets:${a.id}`} account={a} accounts={bal.accounts} pockets={pockets} />}
        {a && takesInstallments(a.kind) && <InstallmentsSection key={`plans:${a.id}`} account={a} />}
      </PickedAccount>
      <Budgets />
    </Page>
  );
}
