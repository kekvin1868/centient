// Accounts as playing cards held in a hand, like Balatro: an arched fan you turn with a finger or the mouse
// (drag sideways; it settles on the nearest card) or the arrow keys. The card in the middle sits at the top of
// the arc and its neighbours move out of its way, so a lifted card never hides the others. Any number of
// accounts uses the same fan; cards far from the middle fade. Tap a card to turn to it and pick it (tap the
// picked one again to drop it). With `pickOnSettle` (Money), turning also picks the card it settles on.
// The "All" card (id null) is the joker. Cards are dealt in and float; on a pointer device one tilts toward it.
import { Bank, Cardholder, Cards, ClockCountdown, CreditCard, CurrencyBtc, DeviceMobile, Handshake, Money, type Icon } from '@phosphor-icons/react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { formatMoney, shortMoney } from '../../lib/format';
import { buzz, reducedMotion } from '../../lib/motion';

type HandCard = { id: string | null; name: string; kind: string; balance?: number; currency?: string; note?: ReactNode };

const ICON: Record<string, Icon> = {
  BANK: Bank, DEBIT_CARD: Cardholder, EWALLET: DeviceMobile, CASH: Money, CREDIT_CARD: CreditCard, PAYLATER: ClockCountdown, EXCHANGE: CurrencyBtc, IOU: Handshake, ALL: Cards,
};
// Short type names that fit the card's band.
const KIND: Record<string, string> = { BANK: 'Bank', DEBIT_CARD: 'Debit', EWALLET: 'E-wallet', CASH: 'Cash', CREDIT_CARD: 'Credit', PAYLATER: 'Pay later', EXCHANGE: 'Crypto', IOU: 'IOU', ALL: 'Joker' };
const W = 112, H = 160, LIFT = 20;
// Gap next to the middle card (most of a card, so it stays clear) and between the others (they overlap).
const NEAR = W * 0.84, FAR = W * 0.46;
const spring = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** Where a card sits when it is `d` cards from the middle (d may be fractional while turning). */
function pose(d: number) {
  const a = Math.abs(d), lift = Math.max(0, 1 - a), far = Math.min(a, 3);
  return {
    x: Math.sign(d) * (a <= 1 ? a * NEAR : NEAR + (a - 1) * FAR),
    y: far * far * 7 - lift * LIFT,
    rotate: Math.max(-24, Math.min(24, d * 8)),
    scale: 1 + 0.06 * lift - far * 0.03,
    opacity: Math.max(0, Math.min(1, 3.6 - a)),
    zIndex: 100 - Math.round(a * 10),
  };
}

export function AccountHand({ cards, selected, onPick, label = 'Accounts', pickOnSettle = false }: {
  cards: HandCard[]; selected: string | null | undefined; onPick: (id: string | null) => void; label?: string; pickOnSettle?: boolean;
}) {
  const n = cards.length;
  const start = Math.max(0, cards.findIndex(c => c.id === selected));
  const focus = useMotionValue(cards.some(c => c.id === selected) ? start : Math.floor((n - 1) / 2));
  const [middle, setMiddle] = useState(Math.round(focus.get()));
  useMotionValueEvent(focus, 'change', f => setMiddle(Math.round(f)));
  const dragged = useRef(false);
  const from = useRef(0);
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i));
  const turn = (i: number, pick: boolean) => {
    animate(focus, i, reducedMotion() ? { duration: 0 } : spring);
    if (pick && cards[i]) onPick(cards[i].id);
  };
  // A new account count (added / hidden) keeps the turn inside the hand.
  useEffect(() => { if (focus.get() > n - 1) turn(clamp(focus.get()), false); }, [n]);
  const keys = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = clamp(Math.round(focus.get()) + step);
    (e.currentTarget.querySelectorAll('button')[i] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <motion.div role="group" aria-label={label} onKeyDown={keys}
      className="relative mx-4 overflow-hidden rounded-[22px] border border-edge bg-raised/60 select-none" style={{ height: H + 72, touchAction: 'pan-y' }}
      onPanStart={() => { dragged.current = true; from.current = focus.get(); focus.stop(); }}
      onPan={(_, info) => {
        let f = from.current - info.offset.x / (NEAR * 0.85);
        if (f < 0) f /= 3; else if (f > n - 1) f = n - 1 + (f - (n - 1)) / 3; // rubber band past the ends
        focus.set(f);
      }}
      onPanEnd={(_, info) => {
        setTimeout(() => { dragged.current = false; });
        const i = clamp(Math.round(focus.get() - info.velocity.x / 2600)); // a flick carries a card or two further
        buzz();
        turn(i, pickOnSettle);
      }}>
      {cards.map((c, i) => (
        <Slot key={c.id ?? 'all'} i={i} focus={focus}>
          <Card card={c} i={i} on={c.id === selected} right={i > middle}
            onFocus={() => turn(i, false)}
            onTap={() => {
              if (dragged.current) return;
              buzz();
              turn(i, false);
              onPick(c.id === selected && c.id !== null ? null : c.id);
            }} />
        </Slot>
      ))}
    </motion.div>
  );
}

/** One card's place in the fan, following the turn. */
function Slot({ i, focus, children }: { i: number; focus: MotionValue<number>; children: ReactNode }) {
  const d = useTransform(focus, f => i - f);
  const x = useTransform(d, v => pose(v).x), y = useTransform(d, v => pose(v).y), rotate = useTransform(d, v => pose(v).rotate);
  const scale = useTransform(d, v => pose(v).scale), opacity = useTransform(d, v => pose(v).opacity), zIndex = useTransform(d, v => pose(v).zIndex);
  return (
    <motion.div data-slot className="absolute" style={{ left: `calc(50% - ${W / 2}px)`, top: LIFT + 18, width: W, height: H, x, y, rotate, scale, opacity, zIndex, transformOrigin: '50% 130%' }}>
      {children}
    </motion.div>
  );
}

/** In the fan cards overlap: the balance uses the short form (Rp9,8jt), and cards right of the middle put their
 * name and balance on the right, the corner that shows. */
function Card({ card: c, i, on, right, onTap, onFocus }: { card: HandCard; i: number; on: boolean; right: boolean; onTap: () => void; onFocus: () => void }) {
  const I = ICON[c.kind] ?? Cards;
  const tilt = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 16}deg`);
    e.currentTarget.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 16}deg`);
  };
  const untilt = (e: PointerEvent<HTMLElement>) => { e.currentTarget.style.removeProperty('--rx'); e.currentTarget.style.removeProperty('--ry'); };
  const money = c.balance !== undefined ? formatMoney(c.balance, c.currency) : null;
  return (
    <div className="size-full" style={{ animation: `deal 520ms cubic-bezier(.2,.9,.3,1.2) ${Math.min(i, 8) * 60}ms both` }}>
      <div className="bob size-full" style={{ animationDelay: `${i * -0.7}s` }}>
        <button type="button" aria-pressed={on} onClick={onTap} onFocus={onFocus}
          onPointerMove={tilt} onPointerLeave={untilt} aria-label={`${c.name}${money ? `, ${money}` : ''}`}
          className={`rarity-${c.kind} panel relative flex size-full flex-col overflow-hidden rounded-[14px] bg-white text-ink dark:bg-raised ${right ? 'items-end text-right' : 'text-left'}
            [transform:perspective(520px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-[transform,box-shadow,border-color] duration-150
            ${on ? '!border-[var(--miku)] shadow-[0_6px_0_color-mix(in_oklab,var(--miku)_55%,transparent)]' : 'shadow-[-4px_4px_12px_rgb(0_0_0/0.10)]'}`}>
          <span className="halftone relative flex h-7 w-full shrink-0 items-center justify-between border-b border-edge bg-[var(--rarity)] px-2 text-[10px] font-bold uppercase tracking-wider text-[#0b0f0f]">
            <span className="relative truncate">{KIND[c.kind] ?? c.kind}</span>
            <I className="relative shrink-0" size={14} weight="bold" aria-hidden="true" />
          </span>
          <span className="line-clamp-2 break-words px-2.5 pt-2 text-[17px] font-extrabold leading-[1.1] tracking-[-0.02em]">{c.name}</span>
          {money && <span className={`num truncate px-2.5 pt-1 text-[13px] font-bold ${c.balance! < 0 ? 'text-negative' : 'text-muted'}`}>{shortMoney(c.balance!, c.currency)}</span>}
          <span className="mt-auto px-2.5 pb-2.5">
            {c.note && <span className="block truncate text-[11px] font-semibold text-muted">{c.note}</span>}
            <I className="mt-1 text-[var(--rarity)]" size={20} weight="fill" aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}
