// Pockets as a wallet of stacked cards (Cash App / Apple Wallet): each card shows its top strip, the last one
// shows in full. Tap a card to slide the ones below it away and reveal it with its actions; tap again to close.
import { ArrowsLeftRight, Plus } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import type { Envelope } from '../../../src/application/ports';
import { formatMoney } from '../lib/format';
import { buzz } from '../lib/motion';

type Pocket = Envelope & { balance: number };
const H = 196, PEEK = 88;
const SKIN: Record<Pocket['kind'], { bg: string; label: string }> = {
  SPENDING: { bg: 'linear-gradient(135deg, var(--miku), color-mix(in oklab, var(--miku) 55%, #0a6b8a))', label: 'Spending' },
  SAVINGS: { bg: 'linear-gradient(135deg, #bec8d1, #86cecb)', label: 'Savings' },
  GOAL: { bg: 'linear-gradient(135deg, #ffc2df, #ff6fb5)', label: 'Goal' },
};
const spring = 'cubic-bezier(.34,1.3,.64,1)';

export function PocketStack({ pockets, onAdd, onMoveOut }: { pockets: Pocket[]; onAdd: (id: string) => void; onMoveOut: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mx-4" role="list" aria-label="Pockets">
      {pockets.map((p, i) => {
        const isOpen = open === p.id;
        // A card is covered by the next one, except the last and the open one.
        const covered = i < pockets.length - 1 && !isOpen;
        return (
          <div key={p.id} role="listitem" className="relative" style={{
            zIndex: i, marginTop: i === 0 ? 0 : open === pockets[i - 1]?.id ? 14 : -(H - PEEK),
            transition: `margin-top 520ms ${spring}`,
          }}>
            <PocketCard pocket={p} open={isOpen} covered={covered} onToggle={() => { buzz(); setOpen(isOpen ? null : p.id); }} />
            {/* Actions under the open card; grid rows 0fr -> 1fr animates the height without measuring. */}
            <div className="grid" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', transition: `grid-template-rows 420ms ${spring}` }}>
              <div className="overflow-hidden">
                <div className="flex gap-3 pt-4 pb-1" inert={!isOpen}>
                  <Action icon={<Plus size={20} weight="bold" />} onClick={() => onAdd(p.id)}>Add money</Action>
                  <Action icon={<ArrowsLeftRight size={20} weight="bold" />} onClick={() => onMoveOut(p.id)}>Move out</Action>
                </div>
              </div>
            </div>
          </div>
        );
      })}
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

function PocketCard({ pocket: p, open, covered, onToggle }: { pocket: Pocket; open: boolean; covered: boolean; onToggle: () => void }) {
  const skin = SKIN[p.kind];
  const goal = p.kind === 'GOAL' && p.target_amount ? Math.min(1, Math.max(0, p.balance / p.target_amount)) : null;
  return (
    <button type="button" aria-expanded={open} onClick={onToggle}
      aria-label={`${p.name}, ${skin.label}, ${formatMoney(p.balance, p.currency_code)}`}
      className="panel halftone relative flex w-full flex-col justify-start overflow-hidden rounded-[22px] p-5 text-left text-[#0b0f0f]"
      style={{ height: H, background: skin.bg, transform: open ? 'translateY(-4px)' : undefined, transition: `transform 400ms ${spring}` }}>
      {/* Top strip: what shows while the card is covered. */}
      <span className="relative flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">{p.name}</span>
          <span className="mt-1 block text-[11px] font-bold uppercase tracking-wider opacity-70">{skin.label}</span>
        </span>
        <span className={`num shrink-0 text-[17px] font-extrabold tracking-[-0.02em] transition-opacity duration-300 ${covered ? 'opacity-100' : 'opacity-0'}`}>
          {formatMoney(p.balance, p.currency_code)}
        </span>
      </span>
      {/* The chip, for the credit-card read. */}
      <span className="relative mt-3 block h-7 w-10 rounded-md border border-[#0b0f0f]/30 bg-gradient-to-br from-[#f4f7f9] to-[#a9b6c1]" aria-hidden="true" />
      <span className="absolute inset-x-5 bottom-4">
        {goal !== null && (
          <span className="mb-2 flex items-center gap-2 text-[12px] font-bold">
            {/* Ten-segment XP bar. */}
            <span className="flex flex-1 gap-0.5 rounded-[3px] border border-[#0b0f0f]/40 bg-black/10 p-0.5" aria-hidden="true">
              {Array.from({ length: 10 }, (_, k) => <span key={k} className={`h-2 flex-1 ${k < Math.round(goal * 10) ? 'bg-[#0b0f0f]' : ''}`} />)}
            </span>
            {Math.round(goal * 100)}% of {formatMoney(p.target_amount!, p.currency_code)}
          </span>
        )}
        <span className="num block text-[30px] font-extrabold leading-none tracking-[-0.04em]">{formatMoney(p.balance, p.currency_code)}</span>
      </span>
    </button>
  );
}
