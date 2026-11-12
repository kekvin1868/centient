// Money: the total, accounts as cards (one is always picked: Home's account, else the first everyday one; picking
// here picks it on Home too), its free balance, actions, pockets, card bill and installments, then budgets and
// the way into Subscriptions.
import { useQuery } from '@tanstack/react-query';
import { BlockTitle } from 'konsta/react';
import { useEffect, useState } from 'react';
import { AccountHand } from '../features/accounts/AccountHand';
import { PickedAccount } from '../features/accounts/PickedAccount';
import { TotalBalance } from '../features/accounts/TotalBalance';
import { Budgets } from '../features/budgets/Budgets';
import { PaidBackSheet } from '../features/entries/PaidBackSheet';
import { InstallmentsSection } from '../features/installments/InstallmentsSection';
import { takesInstallments } from '../features/installments/plans';
import { AccountPockets } from '../features/pockets/AccountPockets';
import { CardStatement } from '../features/recurring/CardStatement';
import { SubscriptionsLazy } from '../features/recurring/SubscriptionsLazy';
import { SubscriptionsLink } from '../features/recurring/SubscriptionsLink';
import { Page } from '../layouts/Page';
import { formatMoney } from '../lib/format';
import { idrValue } from '../lib/prices';
import { usePrices } from '../models/price';
import { stickersOf } from '../lib/nameSticker';
import { catalog, moneyPick, selectedAccount } from '../lib/state';
import { accountQueries } from '../models/account';
import type { PayMode } from '../models/payback';

export function Money({ onShowAccount }: { onShowAccount: () => void }) {
  const { data: bal } = useQuery(accountQueries.balances());
  const [picked, setPicked] = useState<string | null>(moneyPick.peek() ?? selectedAccount.value);
  useEffect(() => {
    moneyPick.value = null;
  }, []);
  const prices = usePrices();
  const [pay, setPay] = useState<{ tabId: string; mode: PayMode } | null>(null);
  const [subscriptions, setSubscriptions] = useState(false);
  if (!bal) return <Page title="Money" />;
  // A person's tab at exactly 0 is settled: no card. Their next bill brings it back.
  const held = bal.accounts.filter(x => x.kind !== 'IOU' || x.balance !== 0);
  const a = held.find(x => x.id === picked) ?? held.find(x => x.kind !== 'IOU') ?? held[0] ?? null;
  const pockets = a ? bal.envelopes.filter(e => e.account_id === a.id && !e.archived_at) : [];
  // Home has no IOU accounts, so an IOU pick stays on Money.
  const pick = (id: string | null) => {
    if (!id) return;
    setPicked(id);
    if (bal.accounts.find(x => x.id === id)?.kind !== 'IOU') selectedAccount.value = id;
  };

  return (
    <Page title="Money">
      <TotalBalance accounts={bal.accounts} />
      <BlockTitle
        medium
        className="!pl-4 !text-[22px] !font-extrabold !leading-none !tracking-[-0.03em]"
      >
        Accounts
      </BlockTitle>
      <AccountHand
        selected={a?.id ?? null}
        onPick={pick}
        pickOnSettle
        cards={held.map(x => {
          const v = x.currency_code === 'IDR' ? null : idrValue(x.balance, x.currency_code, prices);
          return {
            id: x.id,
            name: x.name,
            kind: x.kind,
            balance: x.balance,
            currency: x.currency_code,
            note: v !== null ? `≈ ${formatMoney(v)}` : undefined,
            stickers: stickersOf(catalog.value.accounts.find(c => c.id === x.id)),
          };
        })}
      />
      <PickedAccount
        account={a}
        pockets={pockets}
        onShow={x => {
          selectedAccount.value = x.id;
          onShowAccount();
        }}
        onPay={(x, mode) => setPay({ tabId: x.id, mode })}
      >
        {a && a.kind !== 'IOU' && (
          <AccountPockets
            key={`pockets:${a.id}`}
            account={a}
            accounts={bal.accounts}
            pockets={pockets}
          />
        )}
        {a && takesInstallments(a.kind) && <CardStatement key={`bill:${a.id}`} account={a} />}
        {a && takesInstallments(a.kind) && (
          <InstallmentsSection key={`plans:${a.id}`} account={a} />
        )}
      </PickedAccount>
      {pay && <PaidBackSheet {...pay} onClose={() => setPay(null)} />}
      <Budgets />
      <SubscriptionsLink onOpen={() => setSubscriptions(true)} />
      <SubscriptionsLazy open={subscriptions} onClose={() => setSubscriptions(false)} />
    </Page>
  );
}
