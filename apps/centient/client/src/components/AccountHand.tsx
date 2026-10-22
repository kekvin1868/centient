// Accounts as playing cards, like Balatro. Up to five accounts are held as a hand: an arched fan, cards
// overlapping and tilted around the middle. Six or more become a straight row you swipe sideways, every card
// whole. Cards are dealt in (a new account's card is dealt when it appears), float gently, and the one you
// tap lifts out of the hand (tap again to drop it). The "All" card (id null) is the joker; it is not counted
// as an account. On a pointer device the card under the pointer tilts toward it.
import { Bank, Cardholder, Cards, ClockCountdown, CreditCard, CurrencyBtc, DeviceMobile, Handshake, Money, type Icon } from '@phosphor-icons/react';
import type { PointerEvent, ReactNode } from 'react';
import { formatMoney, shortMoney } from '../lib/format';
import { buzz } from '../lib/motion';

export type HandCard = { id: string | null; name: string; kind: string; balance?: number; currency?: string; note?: ReactNode };

const ICON: Record<string, Icon> = {
  BANK: Bank, DEBIT_CARD: Cardholder, EWALLET: DeviceMobile, CASH: Money, CREDIT_CARD: CreditCard, PAYLATER: ClockCountdown, EXCHANGE: CurrencyBtc, IOU: Handshake, ALL: Cards,
};
// Short type names that fit the card's band.
const KIND: Record<string, string> = { BANK: 'Bank', DEBIT_CARD: 'Debit', EWALLET: 'E-wallet', CASH: 'Cash', CREDIT_CARD: 'Credit', PAYLATER: 'Pay later', EXCHANGE: 'Crypto', IOU: 'IOU', ALL: 'Joker' };
const W = 112, H = 160, LIFT = 22;
/** Up to this many accounts are held as an arched hand; more become a scrolling row. */
export const HAND_MAX = 5;

export function AccountHand({ cards, selected, onPick, label = 'Accounts' }: {
  cards: HandCard[]; selected: string | null | undefined; onPick: (id: string | null) => void; label?: string;
}) {
  const accounts = cards.filter(c => c.id !== null).length;
  const arched = accounts <= HAND_MAX;
  const n = cards.length;
  const mid = (n - 1) / 2;
  // Spread to the tray's width (container query units), overlapping once the hand is wider than it.
  // The outer cards' tilt swings them out a little more, so the spread leaves 40px of room.
  const step = `min(${W - 18}px, (100cqw - ${W + 40}px) / ${Math.max(1, n - 1)})`;
  const arc = (off: number) => off * off * (n > 4 ? 2.5 : 4);
  const drop = arc(Math.max(mid, 0));
  return (
    <div role="group" aria-label={label} data-layout={arched ? 'arch' : 'scroll'}
      className={`mx-4 rounded-[22px] border border-edge bg-raised/60 ${arched ? 'px-2 [container-type:inline-size]' : 'overflow-hidden'}`}>
      {arched ? (
        <div className="relative" style={{ height: H + LIFT + drop + 30 }}>
          {cards.map((c, i) => {
            const on = c.id === selected;
            const off = i - mid;
            const transform = on
              ? `translateY(${-LIFT}px) rotate(0deg) scale(1.06)`
              : `translateY(${arc(off)}px) rotate(${off * Math.min(6, 24 / n)}deg)`;
            return (
              <div key={c.id ?? 'all'} data-slot className="absolute" style={{
                left: `calc(50% - ${W / 2}px + ${off} * ${step})`, top: LIFT + 12, width: W, height: H, zIndex: on ? 50 : i,
                transform, transformOrigin: '50% 120%', transition: 'transform 460ms cubic-bezier(.34,1.56,.64,1)',
              }}>
                <Card card={c} i={i} on={on} onPick={onPick} short />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain px-3 pb-3 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_88%,transparent)]"
          style={{ paddingTop: LIFT + 10, scrollPaddingInline: 12 }}>
          {cards.map((c, i) => (
            <div key={c.id ?? 'all'} className="shrink-0 snap-start" style={{ width: W, height: H }}>
              <div className="size-full" style={{ transform: `translateY(${c.id === selected ? -LIFT + 8 : 0}px) scale(${c.id === selected ? 1.04 : 1})`, transition: 'transform 420ms cubic-bezier(.34,1.56,.64,1)' }}>
                <Card card={c} i={i} on={c.id === selected} onPick={onPick} short={false} />
              </div>
            </div>
          ))}
          <div className="w-1 shrink-0" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/** `short`: in a fan, cards overlap, so the balance uses the short form (Rp9,8jt) to fit the visible corner. */
function Card({ card: c, i, on, onPick, short }: { card: HandCard; i: number; on: boolean; onPick: (id: string | null) => void; short: boolean }) {
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
        <button type="button" aria-pressed={on} onClick={() => { buzz(); onPick(on && c.id !== null ? null : c.id); }}
          onPointerMove={tilt} onPointerLeave={untilt} aria-label={`${c.name}${money ? `, ${money}` : ''}`}
          className={`rarity-${c.kind} panel relative flex size-full flex-col overflow-hidden rounded-[14px] bg-white text-left text-ink dark:bg-raised
            [transform:perspective(520px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-[transform,box-shadow,border-color] duration-150
            ${on ? '!border-[var(--miku)] shadow-[0_6px_0_color-mix(in_oklab,var(--miku)_55%,transparent)]' : 'shadow-[-4px_4px_12px_rgb(0_0_0/0.10)]'}`}>
          <span className="halftone relative flex h-7 shrink-0 items-center justify-between border-b border-edge bg-[var(--rarity)] px-2 text-[10px] font-bold uppercase tracking-wider text-[#0b0f0f]">
            <span className="relative truncate">{KIND[c.kind] ?? c.kind}</span>
            <I className="relative shrink-0" size={14} weight="bold" aria-hidden="true" />
          </span>
          {/* Name and balance sit top-left: in a fan, that corner is what shows (like a playing card's rank). */}
          <span className="line-clamp-2 break-words px-2.5 pt-2 text-[17px] font-extrabold leading-[1.1] tracking-[-0.02em]">{c.name}</span>
          {money && <span className={`num truncate px-2.5 pt-1 text-[13px] font-bold ${c.balance! < 0 ? 'text-negative' : 'text-muted'}`}>{short || money.length > 11 ? shortMoney(c.balance!, c.currency) : money}</span>}
          <span className="mt-auto px-2.5 pb-2.5">
            {c.note && <span className="block truncate text-[11px] font-semibold text-muted">{c.note}</span>}
            <I className="mt-1 text-[var(--rarity)]" size={20} weight="fill" aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}
