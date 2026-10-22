// One account's pockets as a wallet of stacked cards (Cash App / Apple Wallet): each card shows its top strip
// and casts a shadow on the one behind it; the last one shows in full. Tap a card to slide the ones below it
// away and reveal it with its actions; tap again to close. Main (where the account's money lands) only moves
// money out. Each pocket has its own color. A new pocket is placed on the stack like a card set down on a
// table; a hidden one lifts away (Balatro-style, no effects beyond that).
import { ArrowsLeftRight, PencilSimple, Plus } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import type { Envelope } from '../../../src/application/ports';
import { formatMoney } from '../lib/format';
import { buzz, reducedMotion } from '../lib/motion';
import { inkOn, pocketColor } from '../lib/pocketColors';

type Pocket = Envelope & { balance: number };
const H = 196, PEEK = 88;
const KIND: Record<Pocket['kind'], string> = { SPENDING: 'Spending', SAVINGS: 'Savings', GOAL: 'Goal' };
const spring = 'cubic-bezier(.34,1.3,.64,1)';

/** Set down: from a little above, tilted, then it settles flat. Picked up: lifts and fades away. */
const place = {
  initial: { opacity: 0, y: -70, rotate: -5, scale: 1.06 },
  animate: { opacity: 1, y: 0, rotate: 0, scale: 1 },
  exit: { opacity: 0, y: -50, rotate: 5, scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 140, damping: 17, mass: 1.1, opacity: { duration: 0.3 } },
};

export function PocketStack({ pockets, mainId, onAdd, onMoveOut, onEdit }: {
  pockets: Pocket[]; mainId: string | null; onAdd: (id: string) => void; onMoveOut: (id: string) => void; onEdit: (p: Pocket) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const still = reducedMotion();
  return (
    <div className="mx-4" role="list" aria-label="Pockets">
      <AnimatePresence initial={false}>
        {pockets.map((p, i) => {
          const isOpen = open === p.id;
          // A card is covered by the next one, except the last and the open one.
          const covered = i < pockets.length - 1 && !isOpen;
          return (
            <motion.div key={p.id} role="listitem" className="relative"
              initial={still ? false : place.initial} animate={place.animate} exit={still ? undefined : place.exit} transition={place.transition}
              style={{ zIndex: i, marginTop: i === 0 ? 0 : open === pockets[i - 1]?.id ? 14 : -(H - PEEK), transition: `margin-top 520ms ${spring}` }}>
              <PocketCard pocket={p} index={i} main={p.id === mainId} open={isOpen} covered={covered} onToggle={() => { buzz(); setOpen(isOpen ? null : p.id); }} />
              {/* Actions under the open card; grid rows 0fr -> 1fr animates the height without measuring. */}
              <div className="grid" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', transition: `grid-template-rows 420ms ${spring}` }}>
                <div className="overflow-hidden">
                  <div className="flex gap-3 pt-4 pb-1" inert={!isOpen}>
                    {p.id === mainId
                      ? <Action icon={<ArrowsLeftRight size={20} weight="bold" />} onClick={() => onMoveOut(p.id)}>Move to a pocket</Action>
                      : <>
                          <Action icon={<Plus size={20} weight="bold" />} onClick={() => onAdd(p.id)}>Add from Main</Action>
                          <Action icon={<ArrowsLeftRight size={20} weight="bold" />} onClick={() => onMoveOut(p.id)}>Back to Main</Action>
                        </>}
                    <button type="button" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}
                      className="panel grid size-12 shrink-0 place-items-center rounded-2xl bg-raised active:opacity-80">
                      <PencilSimple size={20} weight="bold" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Action({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="panel flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-raised text-[16px] font-bold active:opacity-80">
      {icon}{children}
    </button>
  );
}

function PocketCard({ pocket: p, index, main, open, covered, onToggle }: { pocket: Pocket; index: number; main: boolean; open: boolean; covered: boolean; onToggle: () => void }) {
  const color = pocketColor(p.color, index, main);
  const ink = inkOn(color);
  const goal = p.kind === 'GOAL' && p.target_amount ? Math.min(1, Math.max(0, p.balance / p.target_amount)) : null;
  return (
    <button type="button" aria-expanded={open} onClick={onToggle}
      aria-label={`${p.name}, ${main ? 'Main' : KIND[p.kind]}, ${formatMoney(p.balance, p.currency_code)}`}
      className="halftone relative flex w-full flex-col justify-start overflow-hidden rounded-[22px] border border-black/10 p-5 text-left"
      style={{
        height: H, color: ink,
        background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 78%, black))`,
        // A clear shadow up onto the card behind, so each card reads as lying on top of the stack.
        boxShadow: index > 0 ? '0 -10px 22px -8px rgb(0 0 0 / 0.38), 0 3px 0 rgb(0 0 0 / 0.08)' : '0 3px 0 rgb(0 0 0 / 0.08)',
        transform: open ? 'translateY(-4px)' : undefined, transition: `transform 400ms ${spring}`,
      }}>
      {/* Top strip: what shows while the card is covered. */}
      <span className="relative flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{p.name}</span>
          <span className="mt-1 block text-[11px] font-bold uppercase tracking-wider opacity-75">{main ? 'Main · new money lands here' : KIND[p.kind]}</span>
        </span>
        <span className={`num shrink-0 text-[17px] font-extrabold tracking-[-0.02em] transition-opacity duration-300 ${covered ? 'opacity-100' : 'opacity-0'}`}>
          {formatMoney(p.balance, p.currency_code)}
        </span>
      </span>
      <span className="absolute inset-x-5 bottom-4">
        {goal !== null && (
          <span className="mb-2 flex items-center gap-2 text-[12px] font-bold">
            {/* Ten-step progress bar. */}
            <span className="flex flex-1 gap-0.5 rounded-[3px] border border-current/40 bg-black/10 p-0.5" aria-hidden="true">
              {Array.from({ length: 10 }, (_, k) => <span key={k} className={`h-2 flex-1 ${k < Math.round(goal * 10) ? 'bg-current' : ''}`} />)}
            </span>
            {Math.round(goal * 100)}% of {formatMoney(p.target_amount!, p.currency_code)}
          </span>
        )}
        <span className="num block text-[30px] font-extrabold leading-none tracking-[-0.04em]">{formatMoney(p.balance, p.currency_code)}</span>
      </span>
    </button>
  );
}
