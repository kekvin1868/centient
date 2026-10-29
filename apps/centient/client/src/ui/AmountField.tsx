// Amount input that shows grouping while typing (25.000) and reports minor units. Takes sums too (see useSumInput).
// A Konsta list input with a large number; place it inside a Group (or any Konsta List).
import { ListInput } from 'konsta/react';
import { useSumInput } from './useSumInput';

type Props = { value: number | null; currency?: string; onChange: (minor: number | null, invalid: boolean) => void; label?: string; autoFocus?: boolean };

export function AmountField({ value, currency = 'IDR', onChange, label = 'Amount', autoFocus }: Props) {
  const { input, below } = useSumInput(value, currency, onChange);
  return (
    <ListInput label={`${label}${currency !== 'IDR' ? ` (${currency})` : ''}`}
      input={
        <span className="block py-1">
          <span className="money-big flex items-baseline gap-1 text-[40px]">
            {currency === 'IDR' && <span className="text-[0.55em] text-muted">Rp</span>}
            <input className="num w-full bg-transparent outline-none placeholder:opacity-30" aria-label={label}
              placeholder="0" autoFocus={autoFocus} {...input} />
          </span>
          {below}
        </span>
      } />
  );
}
