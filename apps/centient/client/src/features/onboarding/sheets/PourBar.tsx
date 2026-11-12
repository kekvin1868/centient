// The pour bar: one bar for the money a pocket is filled from, cut in proportion. `base` is what stays, `slice` what
// pours into the pocket (bright), `new` money that did not exist before (pink, past the end). Labels sit under it.
import { formatMoney } from '../../../lib/format';

export type Part = { label: string; amount: number; tone: 'base' | 'other' | 'slice' | 'new' };

export function PourBar({ title, parts, total }: { title: string; parts: Part[]; total: string }) {
  const sum = parts.reduce((s, p) => s + Math.max(0, p.amount), 0) || 1;
  const shown = parts.filter(p => p.amount > 0);
  const named = shown.filter(p => p.tone !== 'other');
  return (
    <div className="k-pour" aria-live="polite">
      <div className="k-pour-head">
        <span>{title}</span>
        <span className="money">{total}</span>
      </div>
      <div className="k-pour-bar" aria-hidden="true">
        {shown.map((p, i) => (
          <span
            key={`${p.label}:${i}`}
            className={`k-pour-seg ${p.tone}`}
            style={{ flexGrow: p.amount / sum }}
          />
        ))}
      </div>
      <div className="k-pour-legend">
        {named.map((p, i) => (
          <span key={`${p.label}:${i}`} className={p.tone}>
            <i aria-hidden="true" />
            {p.label} <b className="money">{formatMoney(p.amount)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
