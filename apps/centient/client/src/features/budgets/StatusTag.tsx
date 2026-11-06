// A budget status as a small coloured tag: On track green, Likely over yellow, Over red. Used on Budgets rows and in
// the Insights Glossary, in the same order. Colours are palette tokens (`--ok` / `--warn` / `--bad` in styles.css).
import { STATUS_LABEL, type BudgetStatus } from '../../models/forecast';

const TONE: Record<BudgetStatus, string> = {
  ON_TRACK: 'bg-ok',
  LIKELY_OVER: 'bg-warn',
  OVER: 'bg-bad',
};
export const toneOf = (status: BudgetStatus) => TONE[status];

export function StatusTag({ status }: { status: BudgetStatus }) {
  return (
    <span
      className={`inline-block px-1.5 py-px text-xs uppercase tracking-[0.08em] text-on-tone shadow-[0_2px_0_var(--lip)] ${toneOf(status)}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
