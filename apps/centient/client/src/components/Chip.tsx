// One parsed entry under the log box: ready to save, asking one question, or needing the full form.
// A Konsta card: tap the top to edit; a question shows its answers below.
import { Card, Chip as KChip } from 'konsta/react';
import { Children, type ReactNode } from 'react';

export type ChipState = 'ready' | 'ask' | 'incomplete';
type Props = {
  state: ChipState;
  emoji: string;
  title: ReactNode;
  sub?: ReactNode;
  amount?: ReactNode;
  question?: string;
  children?: ReactNode;
  onOpen: () => void;
};

const STATUS: Record<ChipState, string> = { ready: 'Ready', ask: 'Check', incomplete: 'Tap to finish' };
const STATUS_COLORS: Record<ChipState, { fillBgIos: string; fillTextIos: string }> = {
  ready: { fillBgIos: 'bg-primary/15', fillTextIos: 'text-primary' },
  ask: { fillBgIos: 'bg-primary', fillTextIos: 'text-white' },
  incomplete: { fillBgIos: 'bg-black/5 dark:bg-white/10', fillTextIos: 'opacity-70' },
};

export function Chip({ state, emoji, title, sub, amount, question, children, onOpen }: Props) {
  const actions = Children.toArray(children).length > 0; // false / null slots don't count
  return (
    <Card raised className="!m-0 !mb-2.5" contentWrapPadding="p-0">
      <button type="button" className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:opacity-70" onClick={onOpen} aria-label="Edit details">
        <span className={`grid place-items-center size-10 shrink-0 rounded-xl text-[22px] ${state === 'incomplete' ? 'bg-black/5 dark:bg-white/10' : 'bg-primary/15'}`} aria-hidden="true">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {sub && <span className="block truncate text-sm opacity-60">{sub}</span>}
        </span>
        <span className="flex flex-col items-end gap-1">
          {amount !== undefined && <span className="num font-bold">{amount}</span>}
          <KChip className="!m-0 !h-6 !text-xs font-semibold" colors={STATUS_COLORS[state]}>{STATUS[state]}</KChip>
        </span>
      </button>
      {(question || actions) && (
        <div className="mx-2.5 mb-2.5 rounded-xl bg-primary/10 p-3">
          {question && <div className="text-[15px] font-semibold">{question}</div>}
          {actions && <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>}
        </div>
      )}
    </Card>
  );
}
