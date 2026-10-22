// Accounts as a hand of cards (Balatro): fanned, dealt in on open, gently floating. Tapping a card lifts it
// (selected); tapping it again drops it. Colors are loot rarities per account type. The "All" card (id null)
// is the joker. On a pointer device the card under the pointer tilts toward it.
import { Bank, Cards, ClockCountdown, CreditCard, CurrencyBtc, DeviceMobile, Handshake, Money, type Icon } from '@phosphor-icons/react';
import type { PointerEvent } from 'react';
import { formatMoney } from '../lib/format';
import { buzz } from '../lib/motion';

export type HandCard = { id: string | null; name: string; kind: string; balance?: number; currency?: string };

const ICON: Record<string, Icon> = {
  BANK: Bank, EWALLET: DeviceMobile, CASH: Money, CREDIT_CARD: CreditCard, PAYLATER: ClockCountdown, EXCHANGE: CurrencyBtc, IOU: Handshake, ALL: Cards,
};
const W = 124, H = 168, LIFT = 26;
// Short type names that fit the card's band.
const KIND: Record<string, string> = { BANK: 'Bank', EWALLET: 'E-wallet', CASH: 'Cash', CREDIT_CARD: 'Credit', PAYLATER: 'Pay later', EXCHANGE: 'Crypto', IOU: 'IOU', ALL: 'Joker' };

export function AccountHand({ cards, selected, onPick, label = 'Accounts' }: {
  cards: HandCard[]; selected: string | null | undefined; onPick: (id: string | null) => void; label?: string;
}) {
  const n = cards.length;
  const mid = (n - 1) / 2;
  // Spread to the container's width (container query units), never wider than a comfortable overlap.
  const step = `min(${W - 24}px, (100cqw - ${W + 16}px) / ${Math.max(1, n - 1)})`;
  const tilt = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 18}deg`);
    e.currentTarget.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 18}deg`);
  };
  const untilt = (e: PointerEvent<HTMLElement>) => { e.currentTarget.style.removeProperty('--rx'); e.currentTarget.style.removeProperty('--ry'); };

  return (
    <div role="group" aria-label={label} className="relative mx-4 [container-type:inline-size]" style={{ height: H + LIFT + 18 }}>
      {cards.map((c, i) => {
        const on = c.id === selected;
        const off = i - mid;
        const rot = on ? 0 : off * Math.min(6, 26 / n);
        const y = on ? 0 : LIFT + Math.abs(off) ** 2 * (n > 4 ? 1.5 : 3);
        const I = ICON[c.kind] ?? Cards;
        return (
          <div key={c.id ?? 'all'} className="absolute top-0" style={{
            left: `calc(50% - ${W / 2}px + ${off} * ${step})`, width: W, height: H, zIndex: on ? 50 : i,
            transform: `translateY(${y}px) rotate(${rot}deg) scale(${on ? 1.06 : 1})`,
            transition: 'transform 480ms cubic-bezier(.34,1.56,.64,1)',
          }}>
            <div className="size-full" style={{ animation: `deal 520ms cubic-bezier(.2,.9,.3,1.2) ${i * 70}ms both` }}>
              <div className="bob size-full" style={{ animationDelay: `${i * -0.7}s` }}>
                <button type="button" aria-pressed={on} onClick={() => { buzz(); onPick(on && c.id !== null ? null : c.id); }}
                  onPointerMove={tilt} onPointerLeave={untilt}
                  aria-label={`${c.name}${c.balance !== undefined ? `, ${formatMoney(c.balance, c.currency)}` : ''}`}
                  className={`rarity-${c.kind} panel relative flex size-full flex-col overflow-hidden rounded-[14px] bg-white text-left text-ink dark:bg-raised
                    [transform:perspective(520px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] transition-[transform,box-shadow] duration-150
                    ${on ? '!border-[var(--miku)] shadow-[0_6px_0_color-mix(in_oklab,var(--miku)_55%,transparent)]' : ''}`}>
                  <span className="halftone relative flex h-8 shrink-0 items-center justify-between border-b border-edge bg-[var(--rarity)] px-2 text-[10px] font-bold uppercase tracking-wider text-[#0b0f0f]">
                    <span className="relative truncate">{KIND[c.kind] ?? c.kind}</span>
                    <I className="relative shrink-0" size={16} weight="bold" aria-hidden="true" />
                  </span>
                  <span className="line-clamp-2 px-2.5 pt-2 text-[19px] font-extrabold leading-[1.05] tracking-[-0.02em]">{c.name}</span>
                  <span className="mt-auto px-2.5 pb-2.5">
                    {c.balance !== undefined && (
                      <span className={`num block font-bold ${formatMoney(c.balance, c.currency).length > 11 ? 'text-[12px]' : 'text-[14px]'} ${c.balance < 0 ? 'text-negative' : ''}`}>{formatMoney(c.balance, c.currency)}</span>
                    )}
                    <I className="mt-1 text-[var(--rarity)]" size={22} weight="fill" aria-hidden="true" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
