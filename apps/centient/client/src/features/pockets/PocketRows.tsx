// An account's pockets (not Main: that is the account's balance) as a list that scrolls with the page. Each row
// keeps its pocket's color and pattern as a strip on the left; a goal shows how far along it is. Tap a row for its
// actions.
import type { CSSProperties } from 'react';
import type { Envelope } from '../../../../src/repos/envelopes';
import { formatMoney, POCKET_KINDS } from '../../lib/format';
import { inkOn, patternOf, pocketColor } from '../../lib/pocketColors';

export type Pocket = Envelope & { balance: number };

export function PocketRows({ pockets, colorIndex, onOpen }: { pockets: Pocket[]; colorIndex: (p: Pocket) => number; onOpen: (p: Pocket) => void }) {
  if (!pockets.length) return <p className="text-[14px] font-semibold text-muted">No pockets yet. A pocket sets some of this account's money aside.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {pockets.map(p => {
        const i = colorIndex(p);
        const color = pocketColor(p.color, i, false);
        const pattern = patternOf(p.pattern ?? i);
        const goal = p.kind === 'GOAL' && p.target_amount ? Math.min(1, Math.max(0, p.balance / p.target_amount)) : null;
        return (
          <li key={p.id}>
            <button type="button" onClick={() => onOpen(p)} aria-label={`${p.name}, ${POCKET_KINDS[p.kind]}, ${formatMoney(p.balance, p.currency_code)}`}
              className="panel flex w-full items-stretch overflow-hidden rounded-[4px] bg-raised text-left active:opacity-80">
              <span className="relative w-4 shrink-0 overflow-hidden" aria-hidden="true"
                style={{ background: color, '--pc': inkOn(color) === '#ffffff' ? 'rgb(255 255 255 / 0.3)' : 'rgb(11 15 16 / 0.2)' } as CSSProperties}>
                <span className="absolute -inset-1/2" style={{ background: pattern.background, transform: pattern.turned ? 'rotate(90deg)' : undefined }} />
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-extrabold leading-tight">{p.name}</span>
                  <span className="block text-[13px] font-semibold text-muted">
                    {goal !== null ? `${Math.round(goal * 100)}% of ${formatMoney(p.target_amount!, p.currency_code)}` : POCKET_KINDS[p.kind]}
                  </span>
                </span>
                <span className="num shrink-0 text-[18px] font-extrabold tracking-[-0.03em]">{formatMoney(p.balance, p.currency_code)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
