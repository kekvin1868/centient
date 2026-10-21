// Amount input that shows grouping while typing (25.000) and reports minor units. A Konsta list input
// with a large number; place it inside a Group (or any Konsta List).
import { DECIMALS } from '@centient/money';
import { ListInput } from 'konsta/react';
import { useEffect, useState } from 'react';

type Props = { value: number | null; currency?: string; onChange: (minor: number | null) => void; label?: string; autoFocus?: boolean };

const show = (minor: number | null, cur: string) => {
  if (minor === null) return '';
  const d = DECIMALS[cur] ?? 0;
  return (minor / 10 ** d).toLocaleString(cur === 'IDR' ? 'id-ID' : 'en-US', { maximumFractionDigits: d });
};

export function AmountField({ value, currency = 'IDR', onChange, label = 'Amount', autoFocus }: Props) {
  const [text, setText] = useState(show(value, currency));
  useEffect(() => setText(show(value, currency)), [value, currency]);
  const d = DECIMALS[currency] ?? 0;
  const read = (raw: string) => {
    // Rupiah: every non-digit is grouping. Others: the last "." or "," is the decimal point.
    if (currency === 'IDR') { const n = raw.replace(/\D/g, ''); return n ? Number(n) : null; }
    const m = raw.replace(/[^\d.,]/g, '').match(/^(.*?)(?:[.,](\d*))?$/);
    if (!m || (!m[1] && !m[2])) return null;
    return Math.round(Number(`${m[1].replace(/[.,]/g, '') || '0'}.${m[2] ?? '0'}`) * 10 ** d);
  };
  return (
    <ListInput label={`${label}${currency !== 'IDR' ? ` (${currency})` : ''}`}
      input={
        <span className="flex items-baseline gap-1 text-[28px] font-semibold">
          {currency === 'IDR' && <span className="opacity-50">Rp</span>}
          <input className="num w-full bg-transparent outline-none placeholder:opacity-30" aria-label={label} inputMode={d ? 'decimal' : 'numeric'}
            placeholder="0" value={text} autoFocus={autoFocus}
            onChange={e => {
              const raw = (e.target as HTMLInputElement).value;
              const minor = read(raw);
              setText(currency === 'IDR' && minor !== null ? show(minor, currency) : raw);
              onChange(minor);
            }} />
        </span>
      } />
  );
}
