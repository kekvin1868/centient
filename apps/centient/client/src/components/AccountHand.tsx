// Accounts as playing cards in a straight row, like Balatro's Joker tray (no arch, no fan): up to four sit
// side by side across the width (narrower, never overlapping, so every balance stays readable); five or
// more become a row you swipe sideways, every card whole. Cards are dealt in, float gently, and the one you tap lifts (tap again to
// drop it). Colors are per account type. The "All" card (id null) is the joker. On a pointer device the
// card under the pointer tilts toward it.
import { Bank, Cardholder, Cards, ClockCountdown, CreditCard, CurrencyBtc, DeviceMobile, Handshake, Money, type Icon } from '@phosphor-icons/react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { formatMoney, shortMoney } from '../lib/format';
import { buzz } from '../lib/motion';

export type HandCard = { id: string | null; name: string; kind: string; balance?: number; currency?: string; note?: ReactNode };

const ICON: Record<string, Icon> = {
  BANK: Bank, DEBIT_CARD: Cardholder, EWALLET: DeviceMobile, CASH: Money, CREDIT_CARD: CreditCard, PAYLATER: ClockCountdown, EXCHANGE: CurrencyBtc, IOU: Handshake, ALL: Cards,
};
// Short type names that fit the card's band.
const KIND: Record<string, string> = { BANK: 'Bank', DEBIT_CARD: 'Debit', EWALLET: 'E-wallet', CASH: 'Cash', CREDIT_CARD: 'Credit', PAYLATER: 'Pay later', EXCHANGE: 'Crypto', IOU: 'IOU', ALL: 'Joker' };
const W = 112, H = 160, LIFT = 14;
/** From this many cards the row scrolls instead of squeezing. */
export const SCROLL_FROM = 5;

export function AccountHand({ cards, selected, onPick, label = 'Accounts' }: {
  cards: HandCard[]; selected: string | null | undefined; onPick: (id: string | null) => void; label?: string;
}) {
  const scroll = cards.length >= SCROLL_FROM;
  const n = cards.length;
  // Tray: cards share the width (container query units), up to full size; four across are compact.
  const width = `min(${W}px, (100cqw - ${(n - 1) * 8}px) / ${n})`;
  const compact = !scroll && n >= 4;
  return (
    <div role="group" aria-label={label} data-layout={scroll ? 'scroll' : 'tray'}
      className={`mx-4 rounded-[22px] border border-edge bg-raised/60 ${scroll ? 'overflow-hidden' : 'px-3 [container-type:inline-size]'}`}>
      {scroll ? (
        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain px-3 pb-3 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_88%,transparent)]"
          style={{ paddingTop: LIFT + 10, scrollPaddingInline: 12 }}>
          {cards.map((c, i) => (
            <div key={c.id ?? 'all'} className="shrink-0 snap-start" style={{ width: W, height: H }}>
              <Card card={c} i={i} on={c.id === selected} onPick={onPick} compact={false} />
            </div>
          ))}
          <div className="w-1 shrink-0" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex justify-center gap-2 pb-3" style={{ paddingTop: LIFT + 10 }}>
          {cards.map((c, i) => (
            <div key={c.id ?? 'all'} className="shrink-0" data-slot style={{ width, height: H }}>
              <Card card={c} i={i} on={c.id === selected} onPick={onPick} compact={compact} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ card: c, i, on, onPick, compact }: { card: HandCard; i: number; on: boolean; onPick: (id: string | null) => void; compact: boolean }) {
  const I = ICON[c.kind] ?? Cards;
  const lift: CSSProperties = { transform: `translateY(${on ? -LIFT : 0}px) scale(${on ? 1.04 : 1})`, transition: 'transform 420ms cubic-bezier(.34,1.56,.64,1)' };
  const tilt = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 16}deg`);
    e.currentTarget.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 16}deg`);
  };
  const untilt = (e: PointerEvent<HTMLElement>) => { e.currentTarget.style.removeProperty('--rx'); e.currentTarget.style.removeProperty('--ry'); };
  const money = c.balance !== undefined ? formatMoney(c.balance, c.currency) : null;
  return (
    <div className="size-full" style={lift}>
      <div className="size-full" style={{ animation: `deal 520ms cubic-bezier(.2,.9,.3,1.2) ${Math.min(i, 8) * 60}ms both` }}>
        <div className="bob size-full" style={{ animationDelay: `${i * -0.7}s` }}>
          <button type="button" aria-pressed={on} onClick={() => { buzz(); onPick(on && c.id !== null ? null : c.id); }}
            onPointerMove={tilt} onPointerLeave={untilt} aria-label={`${c.name}${money ? `, ${money}` : ''}`}
            className={`rarity-${c.kind} panel relative flex size-full flex-col overflow-hidden rounded-[14px] bg-white text-left text-ink dark:bg-raised
              [transform:perspective(520px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-[transform,box-shadow,border-color] duration-150
              ${on ? '!border-[var(--miku)] shadow-[0_6px_0_color-mix(in_oklab,var(--miku)_55%,transparent)]' : ''}`}>
            <span className={`halftone relative flex h-7 shrink-0 items-center justify-between border-b border-edge bg-[var(--rarity)] px-2 font-bold uppercase text-[#0b0f0f] ${compact ? 'text-[9px] tracking-wide' : 'text-[10px] tracking-wider'}`}>
              <span className="relative truncate">{KIND[c.kind] ?? c.kind}</span>
              {!compact && <I className="relative shrink-0" size={14} weight="bold" aria-hidden="true" />}
            </span>
            <span className={`line-clamp-2 break-words pt-2 font-extrabold leading-[1.1] tracking-[-0.02em] ${compact ? 'px-2 text-[14px]' : 'px-2.5 text-[17px]'}`}>{c.name}</span>
            <span className={`mt-auto pb-2.5 ${compact ? 'px-2' : 'px-2.5'}`}>
              {money && <span className={`num block truncate font-bold ${compact ? 'text-[12px]' : money.length > 11 ? 'text-[12px]' : 'text-[14px]'} ${c.balance! < 0 ? 'text-negative' : ''}`}>{compact ? shortMoney(c.balance!, c.currency) : money}</span>}
              {c.note && <span className="block truncate text-[11px] font-semibold text-muted">{c.note}</span>}
              <I className="mt-1 text-[var(--rarity)]" size={20} weight="fill" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
