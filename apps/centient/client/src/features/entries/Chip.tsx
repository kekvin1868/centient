// One parsed entry under the log box, as a loot card: ready to log, asking one question, or needing the full
// form. Tap the top to edit; a question shows its answers below. `hint` sits under the status tag.
import { Card, Chip as KChip } from 'konsta/react';
import { Children, type ReactNode } from 'react';

type ChipState = 'ready' | 'ask' | 'incomplete';
type Props = {
  state: ChipState;
  emoji: string;
  title: ReactNode;
  sub?: ReactNode;
  amount?: ReactNode;
  question?: string;
  hint?: ReactNode;
  children?: ReactNode;
  onOpen: () => void;
};

const STATUS: Record<ChipState, string> = { ready: 'Ready', ask: 'Check', incomplete: 'Tap to finish' };
const STATUS_COLORS: Record<ChipState, { fillBgIos: string; fillTextIos: string }> = {
  ready: { fillBgIos: 'bg-miku', fillTextIos: 'text-on-miku' },
  ask: { fillBgIos: 'bg-[#ff8cc6]', fillTextIos: 'text-[#0b0f0f]' },
  incomplete: { fillBgIos: 'bg-raised-2', fillTextIos: 'text-muted' },
};

export function Chip({ state, emoji, title, sub, amount, question, hint, children, onOpen }: Props) {
  const actions = Children.toArray(children).length > 0; // false / null slots don't count
  return (
    <Card className={`panel !m-0 !mb-3 !rounded-[18px] !bg-white dark:!bg-raised ${state === 'ready' ? '!border-l-[8px] !border-l-[var(--miku)]' : ''}`} contentWrapPadding="p-0">
      <button type="button" className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:opacity-70" onClick={onOpen} aria-label="Edit details">
        <span className={`grid place-items-center size-10 shrink-0 rounded-xl text-[22px] ${state === 'incomplete' ? 'bg-raised-2' : 'bg-miku/25'}`} aria-hidden="true">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold leading-tight tracking-[-0.01em]">{title}</span>
          {sub && <span className="block truncate text-sm text-muted">{sub}</span>}
        </span>
        <span className="flex flex-col items-end gap-1">
          {amount !== undefined && <span className="num text-[16px] font-extrabold tracking-[-0.02em]">{amount}</span>}
          <KChip className="!m-0 !h-6 !rounded-md !border-2 !border-edge !text-[10px] font-bold uppercase tracking-wider" colors={STATUS_COLORS[state]}>{STATUS[state]}</KChip>
          {hint && <span className="text-[10px] font-bold uppercase tracking-wider text-primary">{hint}</span>}
        </span>
      </button>
      {(question || actions) && (
        <div className="mx-2.5 mb-2.5 rounded-2xl bg-raised-2 p-3">
          {question && <div className="text-[15px] font-semibold">{question}</div>}
          {actions && <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>}
        </div>
      )}
    </Card>
  );
}
