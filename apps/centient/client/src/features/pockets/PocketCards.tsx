// An account's pockets (not Main: that is the account's balance) as cards stacked down the page, scrolling with it.
// Each card keeps its pocket's color, pattern and glow; a goal shows how far along it is. Tap a card for its actions.
// New cards render in from a scanline and removed ones collapse out, like the other lists.
import autoAnimate from '@formkit/auto-animate';
import { useEffect, useRef, type CSSProperties } from 'react';
import type { Envelope } from '../../../../src/repos/envelopes';
import { formatMoney, POCKET_KINDS } from '../../lib/format';
import { retroList } from '../../lib/motion';
import { inkOn, patternOf, pocketColor } from '../../lib/pocketColors';

export type Pocket = Envelope & { balance: number };

export function PocketCards({ pockets, colorIndex, onOpen }: { pockets: Pocket[]; colorIndex: (p: Pocket) => number; onOpen: (p: Pocket) => void }) {
  const list = useRef<HTMLUListElement>(null);
  // Attached after the first paint: the cards shown on opening appear at once; added / removed ones render in / out.
  useEffect(() => { if (list.current) autoAnimate(list.current, retroList); }, []);
  return (
    <>
      {!pockets.length && <p className="text-[14px] font-semibold text-muted">No pockets yet. A pocket sets some of this account's money aside.</p>}
      <ul ref={list} className="flex flex-col gap-4 px-1 pb-2">
        {pockets.map(p => {
          const i = colorIndex(p);
          const color = pocketColor(p.color, i, false);
          const ink = inkOn(color);
          const pattern = patternOf(p.pattern ?? i);
          const goal = p.kind === 'GOAL' && p.target_amount ? Math.min(1, Math.max(0, p.balance / p.target_amount)) : null;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p)} aria-label={`${p.name}, ${POCKET_KINDS[p.kind]}, ${formatMoney(p.balance, p.currency_code)}`}
                className="relative flex h-[188px] w-full flex-col justify-between overflow-hidden rounded-[24px] border-2 p-5 text-left active:opacity-90"
                style={{
                  color: ink, '--pc': ink === '#ffffff' ? 'rgb(255 255 255 / 0.26)' : 'rgb(11 15 16 / 0.16)',
                  background: `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 72%, black))`,
                  borderColor: `color-mix(in oklab, ${color} 55%, black)`,
                  boxShadow: `0 6px 0 color-mix(in oklab, ${color} 45%, black), 0 26px 34px -18px color-mix(in oklab, ${color} 80%, transparent)`,
                } as CSSProperties}>
                {/* The pattern fades in from the left, so names and amounts stay easy to read. */}
                <span className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(120deg,transparent_30%,#000_75%)]" aria-hidden="true">
                  <span className="absolute -inset-1/2" style={{ background: pattern.background, transform: pattern.turned ? 'rotate(90deg)' : undefined }} />
                </span>
                <span className="relative min-w-0">
                  <span className="block truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{p.name}</span>
                  <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider opacity-75">{POCKET_KINDS[p.kind]}</span>
                </span>
                <span className="relative">
                  {goal !== null && (
                    <span className="mb-2 flex items-center gap-2 text-[12px] font-bold">
                      <span className="flex flex-1 gap-0.5 rounded-[3px] border border-current/40 bg-black/10 p-0.5" aria-hidden="true">
                        {Array.from({ length: 10 }, (_, k) => <span key={k} className={`h-2 flex-1 ${k < Math.round(goal * 10) ? 'bg-current' : ''}`} />)}
                      </span>
                      {Math.round(goal * 100)}% of {formatMoney(p.target_amount!, p.currency_code)}
                    </span>
                  )}
                  <span className="num block text-[32px] font-extrabold leading-none tracking-[-0.04em]">{formatMoney(p.balance, p.currency_code)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
