// A money amount set large and heavy: "Rp" (or "USD") small and lifted. Changes roll like a score
// and pop. Size comes from `max`; long amounts shrink to fit the width left after `inset` px of padding.
import { formatMoney } from '../lib/format';
import { useCountUp } from '../lib/motion';

export function BigMoney({ minor, currency = 'IDR', max = 56, inset = 32, className = '' }: { minor: number; currency?: string; max?: number; inset?: number; className?: string }) {
  const shown = useCountUp(minor);
  // Sized from the final amount, so the size holds still while the digits roll.
  const len = formatMoney(minor, currency).length;
  // ponytail: ~0.6em per character estimate for Geist 800, not measured.
  const fit = `min(${max}px, calc((min(100vw, 640px) - ${inset}px) / ${len * 0.6}))`;
  const [, sign, cur, digits] = formatMoney(shown, currency).match(/^(-?)(Rp|\S+ )(.*)$/)!;
  return (
    <span className={`money-big block whitespace-nowrap ${className}`} style={{ fontSize: fit }}>
      <span className="sr-only">{formatMoney(minor, currency)}</span>
      <span key={minor} className="inline-block origin-left [animation:pop_.45s_steps(1)]" aria-hidden="true">
        <span className="cur">{sign && '−'}{cur.trim()}</span>{digits}
      </span>
    </span>
  );
}

