// The lifted card's details, under the cards: balance, Update balance / Activity, then whatever the screen
// adds for this account (its pockets, its installments).
import { Button } from 'konsta/react';
import { useState, type ReactNode } from 'react';
import type { Account } from '../../../../src/application/ports';
import { formatMoney } from '../../lib/format';
import { idrValue, priceAge, prices } from '../../lib/prices';
import { BigMoney } from '../../ui/BigMoney';
import { UpdateBalanceSheet } from './UpdateBalanceSheet';

type Bal = Account & { balance: number };

export function PickedAccount({ account: a, onShow, children }: { account: Bal | null; onShow: (a: Account) => void; children?: ReactNode }) {
  const [updating, setUpdating] = useState<Bal | null>(null);
  return (
    <div className="mt-4 grid px-4" style={{ gridTemplateRows: a ? '1fr' : '0fr', transition: 'grid-template-rows 420ms cubic-bezier(.34,1.3,.64,1)' }}>
      <div className="overflow-hidden">
        {a ? (
          <div className="pb-2 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{a.name}</span>
              {a.reconciled_at && <span className="shrink-0 text-[13px] text-muted">Checked {a.reconciled_at.slice(0, 10)}</span>}
            </div>
            <BigMoney minor={a.balance} currency={a.currency_code} max={40} className={`mt-2 ${a.balance < 0 ? 'text-negative' : ''}`} />
            {a.currency_code !== 'IDR' && <CryptoValue account={a} />}
            <div className="mt-4 flex gap-3">
              <Button large rounded className="flex-1" onClick={() => setUpdating(a)}>Update balance</Button>
              <Button large rounded tonal className="flex-1" onClick={() => onShow(a)}>Activity</Button>
            </div>
            {children}
          </div>
        ) : <p className="pb-2 text-center text-[15px] text-muted">Tap a card to update its balance or see its activity.</p>}
      </div>
      <UpdateBalanceSheet key={`account:${updating?.id ?? 'none'}`} account={updating} onClose={() => setUpdating(null)} />
    </div>
  );
}

/** What a crypto balance is worth in rupiah, with how fresh the price is. */
function CryptoValue({ account: a }: { account: Bal }) {
  const v = idrValue(a.balance, a.currency_code, prices.value);
  const age = priceAge(a.currency_code);
  if (v === null) return <div className="mt-2 text-[14px] text-muted">No rupiah price for {a.currency_code}; it isn't in the total.</div>;
  return (
    <div className={`mt-2 text-[14px] font-semibold ${age?.stale ? 'text-negative' : 'text-muted'}`}>
      ≈ {formatMoney(v)} · {age?.stale ? 'last known price, ' : ''}{age?.label}
    </div>
  );
}
