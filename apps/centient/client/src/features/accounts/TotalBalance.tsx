// The total across accounts: rupiah, with crypto counted at its last known price (marked ≈); currencies
// without a rupiah price are listed apart. Credit card and pay later balances are limits, not money: they get
// their own sub-card (CardLimits) and stay out of the total.
import type { Account } from '../../../../src/repos/accounts';
import { formatMoney } from '../../lib/format';
import { idrValue, priceAge } from '../../lib/prices';
import { usePrices, type Prices } from '../../models/price';
import { BigMoney } from '../../ui/BigMoney';
import { isCard } from '../../../../src/domain/recurring';

export type Held = Pick<Account, 'currency_code' | 'kind'> & { balance: number };

/** Credit card and pay later balances are debt against a limit, not money: CardLimits shows them. */

type Limited = Pick<Account, 'kind' | 'credit_limit'> & { balance: number };

/** What an account shows as its amount: a card / pay later with a limit shows what is left of it (limit − owed),
 * never below 0: past the limit it is Rp0 left and `overBy` says how far (owner, 2026-11-23). */
export const shownBalance = (a: Limited) =>
  isCard(a.kind) && a.credit_limit ? Math.max(0, a.credit_limit + a.balance) : a.balance;

/** How far a card / pay later is past its limit (banks let it happen: a purchase let through, interest, fees); 0 otherwise. */
export const overBy = (a: Limited) =>
  isCard(a.kind) && a.credit_limit ? Math.max(0, -(a.credit_limit + a.balance)) : 0;

/** Your money in rupiah (crypto at its last price), limits left out; `unpriced` = currencies with no rupiah price, kept apart. */
export function totalOf(accounts: Held[], p: Prices) {
  let total = 0,
    cryptoIdr = 0;
  const unpriced = new Map<string, number>();
  const priced = new Set<string>();
  for (const a of accounts.filter(a => !isCard(a.kind))) {
    const v = idrValue(a.balance, a.currency_code, p);
    if (v === null) unpriced.set(a.currency_code, (unpriced.get(a.currency_code) ?? 0) + a.balance);
    else {
      total += v;
      if (a.currency_code !== 'IDR') {
        cryptoIdr += v;
        priced.add(a.currency_code);
      }
    }
  }
  return { total, cryptoIdr, unpriced, priced };
}

export function TotalBalance({ accounts }: { accounts: (Account & { balance: number })[] }) {
  const p = usePrices();
  const { total, cryptoIdr, unpriced, priced } = totalOf(accounts, p);
  const age = [...priced].map(c => priceAge(c, p)).find(Boolean);
  return (
    <div className="mx-4 mt-4">
      <div className="text-[15px] font-semibold text-muted">
        Your money{priced.size ? ' ≈' : ''}
      </div>
      <BigMoney minor={total} max={60} className="mt-3" />
      {priced.size > 0 && (
        <div
          className={`mt-2 text-[14px] font-semibold ${age?.stale ? 'text-negative' : 'text-muted'}`}
        >
          Includes ≈ {formatMoney(cryptoIdr)} in crypto ·{' '}
          {age?.stale ? 'last known price, ' : 'price '}
          {age?.label}
        </div>
      )}
      {[...unpriced].map(([c, v]) => (
        <div key={c} className="num mt-2 font-semibold text-muted">
          + {formatMoney(v, c)} (not in the total)
        </div>
      ))}
    </div>
  );
}
