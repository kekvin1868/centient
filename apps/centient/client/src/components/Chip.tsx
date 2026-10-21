// One parsed entry under the log box: ready to save, asking one question, or needing the full form.
// A Konsta card: tap the top to edit; a question shows its answers below.
import { Card, Chip as KChip } from 'konsta/react';
import { toChildArray, type ComponentChildren } from 'preact';

export type ChipState = 'ready' | 'ask' | 'incomplete';
type Props = {
  state: ChipState;
  emoji: string;
  title: ComponentChildren;
  sub?: ComponentChildren;
  amount?: ComponentChildren;
  question?: string;
  children?: ComponentChildren;
  onOpen: () => void;
};

const STATUS: Record<ChipState, string> = { ready: 'Ready', ask: 'Check', incomplete: 'Tap to finish' };
const STATUS_COLORS: Record<ChipState, { fillBgIos: string; fillTextIos: string }> = {
  ready: { fillBgIos: 'bg-primary/15', fillTextIos: 'text-primary' },
  ask: { fillBgIos: 'bg-primary', fillTextIos: 'text-white' },
  incomplete: { fillBgIos: 'bg-black/5 dark:bg-white/10', fillTextIos: 'opacity-70' },
};

export function Chip({ state, emoji, title, sub, amount, question, children, onOpen }: Props) {
  const actions = toChildArray(children).length > 0; // false / null slots don't count
  return (
    <Card raised className="!m-0 !mb-2.5" contentWrapPadding="p-0">
      <button type="button" class="flex w-full items-center gap-3 px-3.5 py-3 text-left active:opacity-70" onClick={onOpen} aria-label="Edit details">
        <span class={`grid place-items-center size-10 shrink-0 rounded-xl text-[22px] ${state === 'incomplete' ? 'bg-black/5 dark:bg-white/10' : 'bg-primary/15'}`} aria-hidden="true">{emoji}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">{title}</span>
          {sub && <span class="block truncate text-sm opacity-60">{sub}</span>}
        </span>
        <span class="flex flex-col items-end gap-1">
          {amount !== undefined && <span class="num font-bold">{amount}</span>}
          <KChip className="!m-0 !h-6 !text-xs font-semibold" colors={STATUS_COLORS[state]}>{STATUS[state]}</KChip>
        </span>
      </button>
      {(question || actions) && (
        <div class="mx-2.5 mb-2.5 rounded-xl bg-primary/10 p-3">
          {question && <div class="text-[15px] font-semibold">{question}</div>}
          {actions && <div class="mt-2.5 flex flex-wrap gap-2">{children}</div>}
        </div>
      )}
    </Card>
  );
}
