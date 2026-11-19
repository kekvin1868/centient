// The total across accounts: rupiah, with crypto counted at its last known price (marked ≈); currencies
// without a rupiah price are listed apart. Credit card and pay later balances are limits, not money: they get
// their own lines and stay out of the total.
import type { Account } from '../../../../src/repos/accounts';
import { formatMoney } from '../../lib/format';
import { idrValue, priceAge } from '../../lib/prices';
import { usePrices, type Prices } from '../../models/price';
import { BigMoney } from '../../ui/BigMoney';

type Held = Pick<Account, 'currency_code' | 'kind'> & { balance: number };

const LIMITS = [
  { kind: 'CREDIT_CARD', label: 'Credit card limit left' },
  { kind: 'PAYLATER', label: 'Pay later limit left' },
] as const;
const isLimit = (a: Held) => LIMITS.some(l => l.kind === a.kind);

/** What is left of the card and pay later limits, per kind that has an account (rupiah, as the total). */
export function limitsOf(accounts: Held[], p: Prices) {
  return LIMITS.flatMap(l => {
    const own = accounts.filter(a => a.kind === l.kind);
    if (!own.length) return [];
    const left = own.reduce((s, a) => s + (idrValue(a.balance, a.currency_code, p) ?? 0), 0);
    return [{ ...l, left, count: own.length }];
  });
}

/** Your money in rupiah (crypto at its last price), limits left out; `unpriced` = currencies with no rupiah price, kept apart. */
export function totalOf(accounts: Held[], p: Prices) {
  let total = 0,
    cryptoIdr = 0;
  const unpriced = new Map<string, number>();
  const priced = new Set<string>();
  for (const a of accounts.filter(a => !isLimit(a))) {
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
  const limits = limitsOf(accounts, p);
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
      {limits.map(l => (
        <div key={l.kind} className="mt-2 flex justify-between gap-3 text-[15px] font-semibold">
          <span className="text-muted">{l.label}</span>
          <span className="num">{formatMoney(l.left)}</span>
        </div>
      ))}
    </div>
  );
}
