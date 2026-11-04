// Money: the total, accounts as cards (one is always picked: Home's account, else the first everyday one; picking
// here picks it on Home too), its free balance, actions, pockets and installments, then budgets.
import { useQuery } from '@tanstack/react-query';
import { BlockTitle } from 'konsta/react';
import { useState } from 'react';
import { AccountHand } from '../features/accounts/AccountHand';
import { PickedAccount } from '../features/accounts/PickedAccount';
import { TotalBalance } from '../features/accounts/TotalBalance';
import { Budgets } from '../features/budgets/Budgets';
import { InstallmentsSection } from '../features/installments/InstallmentsSection';
import { takesInstallments } from '../features/installments/plans';
import { AccountPockets } from '../features/pockets/AccountPockets';
import { Page } from '../layouts/Page';
import { formatMoney } from '../lib/format';
import { idrValue } from '../lib/prices';
import { usePrices } from '../models/price';
import { stickersOf } from '../lib/nameSticker';
import { catalog, selectedAccount } from '../lib/state';
import { accountQueries } from '../models/account';

export function Money({ onShowAccount }: { onShowAccount: () => void }) {
  const { data: bal } = useQuery(accountQueries.balances());
  const [picked, setPicked] = useState<string | null>(selectedAccount.value);
  const prices = usePrices();
  if (!bal) return <Page title="Money" />;
  const a =
    bal.accounts.find(x => x.id === picked) ??
    bal.accounts.find(x => x.kind !== 'IOU') ??
    bal.accounts[0] ??
    null;
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
        cards={bal.accounts.map(x => {
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
      >
        {a && a.kind !== 'IOU' && (
          <AccountPockets
            key={`pockets:${a.id}`}
            account={a}
            accounts={bal.accounts}
            pockets={pockets}
          />
        )}
        {a && takesInstallments(a.kind) && (
          <InstallmentsSection key={`plans:${a.id}`} account={a} />
        )}
      </PickedAccount>
      <Budgets />
    </Page>
  );
}
