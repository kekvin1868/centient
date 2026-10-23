// Amount input that shows grouping while typing (25.000) and reports minor units. A Konsta list input
// with a large number; place it inside a Group (or any Konsta List).
import { DECIMALS } from '@centient/money';
import { ListInput } from 'konsta/react';
import { useEffect, useState } from 'react';
import { amountInput, showAmount } from '../lib/amount';

type Props = { value: number | null; currency?: string; onChange: (minor: number | null) => void; label?: string; autoFocus?: boolean };

export function AmountField({ value, currency = 'IDR', onChange, label = 'Amount', autoFocus }: Props) {
  const [text, setText] = useState(showAmount(value, currency));
  useEffect(() => setText(showAmount(value, currency)), [value, currency]);
  const d = DECIMALS[currency] ?? 0;
  return (
    <ListInput label={`${label}${currency !== 'IDR' ? ` (${currency})` : ''}`}
      input={
        <span className="money-big flex items-baseline gap-1 py-1 text-[40px]">
          {currency === 'IDR' && <span className="text-[0.55em] text-muted">Rp</span>}
          <input className="num w-full bg-transparent outline-none placeholder:opacity-30" aria-label={label} inputMode={d ? 'decimal' : 'numeric'}
            placeholder="0" value={text} autoFocus={autoFocus}
            onChange={e => { const r = amountInput(e.target.value, currency); setText(r.text); onChange(r.minor); }} />
        </span>
      } />
  );
}
