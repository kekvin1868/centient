// Which period Insights shows: ‹ Nov 2026 cycle › and Cycle | Year. `›` stops at the running period, `‹` at the
// period holding the oldest entry (the server says which day that is).
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Segmented } from '../../ui/Segmented';
import { periodLabel, type Span } from './insights';

export type Kind = 'cycle' | 'year';
type Props = {
  kind: Kind;
  span: Span & { from: string; to: string; today: string };
  oldest: string | null;
  onKind: (k: Kind) => void;
  onGo: (date: string) => void;
};

const dayBefore = (day: string) => new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);

export function PeriodBar({ kind, span, oldest, onKind, onGo }: Props) {
  const canBack = oldest !== null && oldest < span.from;
  const canNext = span.to <= span.today;
  const arrow = 'grid h-11 w-11 place-items-center text-ink disabled:opacity-25 active:opacity-60';
  return (
    <>
      <div className="mx-4 mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className={arrow}
          aria-label="Previous period"
          disabled={!canBack}
          onClick={() => onGo(dayBefore(span.from))}
        >
          <CaretLeft size={22} weight="bold" aria-hidden="true" />
        </button>
        <h2 className="text-[20px] leading-none" aria-live="polite">
          {periodLabel(span)}
        </h2>
        <button
          type="button"
          className={arrow}
          aria-label="Next period"
          disabled={!canNext}
          onClick={() => onGo(span.to)}
        >
          <CaretRight size={22} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <Segmented
        label="Period"
        value={kind}
        onChange={onKind}
        options={[
          { value: 'cycle', label: 'Cycle' },
          { value: 'year', label: 'Year' },
        ]}
      />
    </>
  );
}
