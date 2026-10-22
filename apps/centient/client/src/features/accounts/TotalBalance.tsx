// The total across accounts: rupiah, with crypto counted at its last known price (marked ≈); currencies
// without a rupiah price are listed apart.
import type { Account } from '../../../../src/application/ports';
import { formatMoney } from '../../lib/format';
import { idrValue, priceAge, prices } from '../../lib/prices';
import { BigMoney } from '../../ui/BigMoney';

export function TotalBalance({ accounts }: { accounts: (Account & { balance: number })[] }) {
  let total = 0, cryptoIdr = 0;
  const unpriced = new Map<string, number>();
  const priced = new Set<string>();
  for (const a of accounts) {
    const v = idrValue(a.balance, a.currency_code, prices.value);
    if (v === null) unpriced.set(a.currency_code, (unpriced.get(a.currency_code) ?? 0) + a.balance);
    else { total += v; if (a.currency_code !== 'IDR') { cryptoIdr += v; priced.add(a.currency_code); } }
  }
  const age = [...priced].map(c => priceAge(c)).find(Boolean);
  return (
    <div className="mx-4 mt-4">
      <div className="text-[15px] font-semibold text-muted">Total balance{priced.size ? ' ≈' : ''}</div>
      <BigMoney minor={total} max={60} className="mt-3" />
      {priced.size > 0 && (
        <div className={`mt-2 text-[14px] font-semibold ${age?.stale ? 'text-negative' : 'text-muted'}`}>
          Includes ≈ {formatMoney(cryptoIdr)} in crypto · {age?.stale ? 'last known price, ' : 'price '}{age?.label}
        </div>
      )}
      {[...unpriced].map(([c, v]) => <div key={c} className="num mt-2 font-semibold text-muted">+ {formatMoney(v, c)} (not in the total)</div>)}
    </div>
  );
}
