// Vertical bars, one slot per day / month / weekday. A slot with no value yet (the future) stays empty; a 0 is a
// baseline tick. Tap a bar to name it in the readout line above the chart (tap again to let go); with nothing
// tapped the line names the highest bar. Square, palette tokens only; a screen reader hears one summary sentence.
import { useState } from 'react';
import { barScale, describeSeries, readoutIndex } from './chartScale';

export type Bar = { key: string; axis: string; name: string; value: number | null; shown: string };

export function BarChart({ title, bars, empty, readout = b => `${b.name} · ${b.shown}` }: {
  title: string; bars: Bar[]; empty: string; readout?: (b: Bar) => string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const scale = barScale(bars.map(b => b.value ?? 0));
  if (!scale) return <p className="mx-4 border border-dashed border-edge px-4 py-6 text-center text-sm text-muted">{empty}</p>;
  const shown = readoutIndex(bars.map(b => b.value), picked);
  return (
    <figure className="mx-4" aria-label={title}>
      <figcaption className="sr-only">
        {describeSeries(title, bars.filter(b => b.value !== null).map(b => ({ label: b.name, value: b.value!, shown: b.shown })))}
      </figcaption>
      <p className="num mb-2 min-h-[1.4em] text-[15px]" aria-live="polite" data-testid="bar-readout">{shown === null ? '' : readout(bars[shown])}</p>
      <div className="flex h-[120px] items-end gap-[2px] border-b border-edge">
        {bars.map((b, n) => b.value === null
          ? <span key={b.key} className="h-full flex-1" aria-hidden="true" />
          : (
            <button key={b.key} type="button" aria-label={`${b.name}: ${b.shown}`} aria-pressed={picked === n}
              onClick={() => setPicked(picked === n ? null : n)} className="flex h-full min-w-0 flex-1 items-end">
              <span className={`block w-full ${n === shown ? 'bg-ink' : 'bg-miku'}`}
                style={{ height: scale[n] ? `${scale[n] * 100}%` : '2px' }} />
            </button>
          ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[11px] text-muted" aria-hidden="true">
        {bars.map(b => <span key={b.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">{b.axis}</span>)}
      </div>
    </figure>
  );
}
