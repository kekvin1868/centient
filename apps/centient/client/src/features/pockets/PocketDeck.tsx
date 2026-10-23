// One account's pockets as a floating deck of cards. The front card is whole; the ones behind sit higher,
// smaller and dimmer, each with its own color, pattern and glow, so they read as separate cards rather than
// a pile. Swipe the front card left or right (finger or mouse) and it tucks behind the deck; the arrows do the
// same for keyboard and screen readers. A new pocket is set down on top like a card on a table.
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Envelope } from '../../../../src/application/ports';
import { formatMoney, POCKET_KINDS } from '../../lib/format';
import { buzz, reducedMotion } from '../../lib/motion';
import { inkOn, patternOf, pocketColor } from '../../lib/pocketColors';

export type Pocket = Envelope & { balance: number };
const H = 188, PEEK = 46; // how much of each card behind shows: enough for its name
const settle = { type: 'spring', stiffness: 300, damping: 26 } as const;

export function PocketDeck({ pockets, mainId, front, onFront }: { pockets: Pocket[]; mainId: string | null; front: string | null; onFront: (id: string) => void }) {
  const [order, setOrder] = useState(() => pockets.map(p => p.id));
  const seen = useRef(new Set(pockets.map(p => p.id)));
  // Keep the deck's order as pockets come and go; a new pocket is placed on top.
  useEffect(() => {
    const ids = pockets.map(p => p.id);
    const added = ids.filter(id => !seen.current.has(id));
    seen.current = new Set(ids);
    setOrder(o => [...added, ...o.filter(id => ids.includes(id)), ...ids.filter(id => !o.includes(id) && !added.includes(id))]);
  }, [pockets.map(p => p.id).join()]);
  useEffect(() => { if (order[0] && order[0] !== front) onFront(order[0]); }, [order[0]]);
  const cycle = (dir: 1 | -1) => { buzz(); setOrder(o => (dir === 1 ? [...o.slice(1), o[0]] : [o[o.length - 1], ...o.slice(0, -1)])); };
  const shown = order.map(id => pockets.find(p => p.id === id)).filter((p): p is Pocket => Boolean(p));
  const top = shown[0];
  const behind = Math.min(shown.length - 1, 3);
  return (
    <div>
      <div className="relative mx-1" style={{ height: H + behind * PEEK + 10 }}>
        <AnimatePresence initial={false}>
          {shown.map((p, depth) => (
            <DeckCard key={p.id} pocket={p} depth={depth} index={pockets.indexOf(p)} main={p.id === mainId} peek={behind * PEEK} onSwipe={cycle} />
          ))}
        </AnimatePresence>
      </div>
      {top && shown.length > 1 && (
        <div className="mt-3 flex items-center justify-between px-1">
          <span className="text-[13px] font-semibold text-muted" aria-live="polite">{pockets.indexOf(top) + 1} of {pockets.length} · {top.name}</span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => cycle(-1)} aria-label="Previous pocket" className="panel grid size-9 place-items-center rounded-full bg-raised active:opacity-70"><CaretLeft size={16} weight="bold" /></button>
            <button type="button" onClick={() => cycle(1)} aria-label="Next pocket" className="panel grid size-9 place-items-center rounded-full bg-raised active:opacity-70"><CaretRight size={16} weight="bold" /></button>
          </span>
        </div>
      )}
    </div>
  );
}

function DeckCard({ pocket: p, depth, index, main, peek, onSwipe }: { pocket: Pocket; depth: number; index: number; main: boolean; peek: number; onSwipe: (dir: 1 | -1) => void }) {
  const x = useMotionValue(0);
  const tilt = useTransform(x, v => v / 18);
  const still = reducedMotion();
  const front = depth === 0;
  const color = pocketColor(p.color, index, main);
  const ink = inkOn(color);
  const pattern = patternOf(p.pattern ?? index);
  const goal = p.kind === 'GOAL' && p.target_amount ? Math.min(1, Math.max(0, p.balance / p.target_amount)) : null;
  const hidden = depth > 3;
  return (
    <motion.div className="absolute inset-x-0" style={{ top: peek, height: H, zIndex: 50 - depth, pointerEvents: front ? 'auto' : 'none', transformOrigin: '50% 0' }}
      initial={still ? false : { y: -120, rotate: -8, scale: 1.08, opacity: 0 }}
      animate={{ y: -depth * PEEK, scale: 1 - depth * 0.07, rotate: front ? 0 : depth % 2 ? -1.5 : 1.5, opacity: hidden ? 0 : 1, filter: `brightness(${1 - depth * 0.12}) saturate(${1 - depth * 0.15})` }}
      exit={still ? undefined : { y: -80, opacity: 0, rotate: 6, transition: { duration: 0.25 } }}
      transition={still ? { duration: 0 } : settle} aria-hidden={!front}>
      <motion.div className="size-full" style={{ x, rotate: tilt, touchAction: 'pan-y' }} drag={front ? 'x' : false} dragMomentum={false} dragElastic={0.9}
        onDragEnd={async (_, info) => {
          const dir = Math.sign(info.offset.x) as 1 | -1;
          if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 600) {
            await animate(x, dir * 420, still ? { duration: 0 } : { duration: 0.18 });
            onSwipe(1);
          }
          animate(x, 0, still ? { duration: 0 } : settle);
        }}>
        <div role="group" aria-label={`${p.name}, ${main ? 'Main' : POCKET_KINDS[p.kind]}, ${formatMoney(p.balance, p.currency_code)}`}
          className={`relative flex size-full cursor-grab flex-col justify-between overflow-hidden rounded-[24px] border-2 p-5 active:cursor-grabbing ${front && !still ? 'float' : ''}`}
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
          <span className="relative flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{p.name}</span>
              <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider opacity-75">{main ? 'Main · new money lands here' : POCKET_KINDS[p.kind]}</span>
            </span>
            {main && <span className="shrink-0 rounded-lg bg-black/15 px-2 py-1 text-[12px] font-extrabold">MAIN</span>}
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
        </div>
      </motion.div>
    </motion.div>
  );
}
