// Budgets over time: one row per budget, a bar per finished cycle around a middle line: up (teal) for money left
// over, down (pink) for overspending, a grey tick for exactly the limit. Each budget on its own scale (its biggest
// month is full height). Tap a row for the exact Limit / Spent / Saved table under it; tap again to close.
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { signedScale } from '../../ui/chartScale';
import { cycleShort } from './insights';

type Cycle = { from: string; month: number; limit: number; spent: number; saved: number };
export type SavingsBudget = { id: string; name: string; cycles: Cycle[] };

const signed = (n: number, currency: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMoney(Math.abs(n), currency)}`;
const tone = (n: number) => (n > 0 ? 'text-primary' : n < 0 ? 'text-negative' : 'text-muted');

export function SavingsBars({ budgets, currency }: { budgets: SavingsBudget[]; currency: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="mx-4 border-b border-edge">
      {budgets.map(b => {
        const last = b.cycles.at(-1)!;
        const scale = signedScale(b.cycles.map(c => c.saved)) ?? b.cycles.map(() => 0);
        const shown = open === b.id;
        return (
          <li key={b.id} className="border-t border-edge">
            <button type="button" aria-expanded={shown} onClick={() => setOpen(shown ? null : b.id)} className="block w-full py-3 text-left active:opacity-70">
              <span className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate">{b.name}</span>
                <span className={`num shrink-0 text-[13px] ${tone(last.saved)}`}>last: {signed(last.saved, currency)}</span>
              </span>
              <span className="sr-only">{b.cycles.map(c => `${cycleShort(c.month)} ${c.saved < 0 ? 'overspent' : 'saved'} ${formatMoney(Math.abs(c.saved), currency)}`).join(', ')}</span>
              <span className="mt-2 grid h-14 grid-cols-6 gap-1" aria-hidden="true">
                {b.cycles.map((c, n) => (
                  <span key={c.from} className="relative h-full">
                    <span className="absolute inset-x-0 top-1/2 border-t border-edge" />
                    <span className={`absolute inset-x-1 ${c.saved > 0 ? 'bottom-1/2 bg-miku' : c.saved < 0 ? 'top-1/2 bg-pink' : 'top-1/2 -mt-px bg-muted'}`}
                      style={{ height: c.saved ? `${Math.max(2, Math.abs(scale[n]) * 50)}%` : '2px' }} />
                  </span>
                ))}
              </span>
              <span className="mt-1 grid grid-cols-6 gap-1 text-center text-[11px] text-muted" aria-hidden="true">
                {b.cycles.map(c => <span key={c.from}>{cycleShort(c.month)}</span>)}
              </span>
            </button>
            {shown && (
              <table className="num mb-3 w-full text-[13px]">
                <thead><tr className="text-muted"><th className="text-left font-normal">Cycle</th><th className="text-right font-normal">Limit</th><th className="text-right font-normal">Spent</th><th className="text-right font-normal">Saved</th></tr></thead>
                <tbody>
                  {b.cycles.map(c => (
                    <tr key={c.from} className="border-t border-dashed border-edge">
                      <td className="py-1">{cycleShort(c.month)}</td>
                      <td className="text-right">{formatMoney(c.limit, currency)}</td>
                      <td className="text-right">{formatMoney(c.spent, currency)}</td>
                      <td className={`text-right ${tone(c.saved)}`}>{signed(c.saved, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ul>
  );
}
