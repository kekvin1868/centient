// Horizontal bars, largest first: a label and its amount over a bar sized against the largest one, with a note at
// the far right (a share, say). Square, palette tokens only; a screen reader hears one summary sentence and the rows.
// With `onPick`, each row is a button that hands back its key.
import type { ReactNode } from 'react';
import { barScale, describeSeries } from './chartScale';

export type RankedBar = {
  key: string;
  label: ReactNode;
  name: string;
  value: number;
  shown: string;
  note?: string;
};

export function RankedBars({
  title,
  items,
  empty,
  onPick,
}: {
  title: string;
  items: RankedBar[];
  empty: string;
  onPick?: (key: string) => void;
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const scale = barScale(sorted.map(i => i.value));
  if (!scale)
    return (
      <p className="mx-4 border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">
        {empty}
      </p>
    );
  return (
    <figure className="mx-4" aria-label={title}>
      <figcaption className="sr-only">
        {describeSeries(
          title,
          sorted.map(i => ({ label: i.name, value: i.value, shown: i.shown })),
        )}
      </figcaption>
      <ul className="flex flex-col gap-3">
        {sorted.map((i, n) => (
          <li key={i.key} className="ranked-row">
            <Row onClick={onPick && (() => onPick(i.key))}>
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate">{i.label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{i.shown}</span>
                  {i.note && (
                    <span className="ml-2 inline-block min-w-[3ch] text-right text-muted">
                      {i.note}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2.5 border border-edge bg-raised" aria-hidden="true">
                {/* A zero still shows a 2px baseline tick. */}
                <div
                  className="h-full bg-miku"
                  style={{ width: scale[n] ? `${scale[n] * 100}%` : '2px' }}
                />
              </div>
            </Row>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** A tappable row when there is something to open, else a plain block. */
function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return onClick ? (
    <button type="button" onClick={onClick} className="block w-full text-left active:opacity-70">
      {children}
    </button>
  ) : (
    <div>{children}</div>
  );
}
