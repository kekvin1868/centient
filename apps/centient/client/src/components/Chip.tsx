// One parsed entry under the log box: ready to save, asking one question, or needing the full form.
// The state shows as a status pill and, for questions, a tinted answer panel; no colored outlines.
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

export function Chip({ state, emoji, title, sub, amount, question, children, onOpen }: Props) {
  const actions = toChildArray(children).length > 0; // false / null slots don't count
  return (
    <div class={`chip ${state}`}>
      <button type="button" class="chip-main" onClick={onOpen} aria-label="Edit details">
        <span class="chip-avatar" aria-hidden="true">{emoji}</span>
        <span class="row-main">
          <span class="chip-title">{title}</span>
          {sub && <span class="chip-sub">{sub}</span>}
        </span>
        <span class="chip-end">
          {amount !== undefined && <span class="chip-amount num">{amount}</span>}
          <span class={`status ${state}`}>{STATUS[state]}</span>
        </span>
      </button>
      {(question || actions) && (
        <div class="chip-ask">
          {question && <div class="chip-q">{question}</div>}
          {actions && <div class="chip-actions">{children}</div>}
        </div>
      )}
    </div>
  );
}
