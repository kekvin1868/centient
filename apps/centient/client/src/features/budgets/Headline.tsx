// The HUD on Home: the money you hold. All accounts: the total of every account (as on Money); one account: its
// balance. Teal when fine, pink below zero. Under it, the budget card (HomeBudgets).
import { useQuery } from '@tanstack/react-query';
import { ACCOUNT_KINDS } from '../../lib/format';
import { selectedAccount } from '../../lib/state';
import type { Balances } from '../../models/account';
import { budgetsWithWaiting, useBalances, useOverlaySince } from '../../models/useWaiting';
import { budgetQueries } from '../../models/budget';
import { usePrices, type Prices } from '../../models/price';
import { BigMoney } from '../../ui/BigMoney';
import { totalOf } from '../accounts/TotalBalance';
import { HomeBudgets } from './HomeBudgets';

type Head = {
  label: string;
  minor: number;
  currency: string;
  note: string;
  hurt: boolean;
  cta: string;
};

/** What the HUD says: the picked account's balance, else the total of every account (same as Money). */
function headOf(sel: string | null, bal: Balances, prices: Prices): Head {
  const a = sel ? bal.accounts.find(x => x.id === sel) : undefined;
  if (a)
    return {
      label: `In ${a.name}`,
      minor: a.balance,
      currency: a.currency_code,
      note: ACCOUNT_KINDS[a.kind] ?? '',
      hurt: false,
      cta: 'Update balance',
    };
  const { total, priced } = totalOf(bal.accounts, prices);
  const n = bal.accounts.length;
  return {
    label: `Total balance${priced.size ? ' ≈' : ''}`,
    minor: total,
    currency: 'IDR',
    note: `Across ${n} account${n === 1 ? '' : 's'}`,
    hurt: total < 0,
    cta: 'Money',
  };
}

export function Headline({ onGoMoney }: { onGoMoney: () => void }) {
  const sel = selectedAccount.value;
  const { data: bal } = useBalances();
  const { data: budgets, dataUpdatedAt } = useQuery(budgetQueries.status());
  const overlay = useOverlaySince(dataUpdatedAt);
  const prices = usePrices();
  const head = bal ? headOf(sel, bal, prices) : null;
  const account = (sel && bal?.accounts.find(a => a.id === sel)) || null;

  const card = `panel halftone relative mx-4 mt-4 mb-3 rounded-[24px] px-5 pt-4 pb-5 transition-colors duration-500 ${head?.hurt ? 'bg-pink text-white' : 'bg-miku text-[#0b0f0f]'}`;
  if (!head) return <div className={`${card} min-h-48`} />;
  return (
    <>
      <section className={card} aria-label="Your money">
        <div className="relative flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-bold leading-none">{head.label}</h2>
        </div>
        <BigMoney
          minor={head.minor}
          currency={head.currency}
          max={68}
          inset={76}
          className="relative mt-4"
        />
        <div className="relative mt-4 flex items-end justify-between gap-3">
          <p className={`text-[15px] font-medium leading-snug ${head.hurt ? '' : 'opacity-80'}`}>
            {head.note}
          </p>
          <button
            type="button"
            onClick={onGoMoney}
            className="shrink-0 rounded-full bg-[#0b0f0f] px-3.5 py-2 text-[15px] font-bold text-white active:opacity-80"
          >
            {head.cta} ▸
          </button>
        </div>
      </section>
      {budgets && (
        <HomeBudgets
          budgets={budgetsWithWaiting(budgets.budgets, budgets.cycle, overlay)}
          cycle={budgets.cycle}
          account={account}
          onGo={onGoMoney}
        />
      )}
    </>
  );
}
