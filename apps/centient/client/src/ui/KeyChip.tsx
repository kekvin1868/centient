// A small keycap chip with an icon and a word, so a state reads without colour: ✓ PAID, … OWES, ⏸ KEPT, ↩ RETURNED,
// 🧾 SPENT (your own part of a split bill).
import { ArrowUUpLeft, Check, DotsThree, Pause, Receipt } from '@phosphor-icons/react';

export type ChipState = 'PAID' | 'OWES' | 'KEPT' | 'RETURNED' | 'SPENT';

const LOOK = {
  PAID: { icon: Check, word: 'PAID', tone: 'bg-ok text-on-tone' },
  OWES: { icon: DotsThree, word: 'OWES', tone: 'bg-warn text-on-tone' },
  KEPT: { icon: Pause, word: 'KEPT', tone: 'bg-raised-2 text-ink' },
  RETURNED: { icon: ArrowUUpLeft, word: 'RETURNED', tone: 'bg-raised-2 text-muted' },
  SPENT: { icon: Receipt, word: 'SPENT', tone: 'bg-miku text-on-miku' },
} as const;

/** `extra`: shown after the word, e.g. the amount still owed. */
export function KeyChip({ state, extra }: { state: ChipState; extra?: string }) {
  const { icon: Icon, word, tone } = LOOK[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-edge px-1.5 py-[1px] text-[11px] font-bold tracking-[0.06em] shadow-[0_2px_0_var(--lip)] ${tone}`}
    >
      <Icon size={12} weight="bold" aria-hidden="true" />
      {word}
      {extra && <span className="num font-semibold tracking-normal">{extra}</span>}
    </span>
  );
}
