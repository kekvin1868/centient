// NieR rows: the picked row inverts (a fill sweeps in from the left) with a pink ◆ cursor beside it. Rows render in
// from a scanline (staggered on first show), collapse out when removed, and flash when their label or value changes.
// The owner moves the selection (arrow keys go through its layer); rows report taps, or take gesture props instead.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useExits } from './useExits';

export type NightRow = {
  key: string;
  label: ReactNode;
  /** A smaller line under the label. */
  note?: ReactNode;
  /** Right-hand value. */
  side?: ReactNode;
  /** Changes when the row's content changes (e.g. name + value), so it flashes. */
  sig?: string;
  /** on = filled square, off = struck through, add = a "+" instead of the square. */
  mark?: 'on' | 'off' | 'add';
  /** Replaces the plain click (e.g. gestureProps). */
  bind?: Record<string, unknown>;
};

export function NightList({ label, rows, selected, onPick, className = '' }: { label: string; rows: NightRow[]; selected: number; onPick?: (i: number) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(true); // only the first show is staggered
  useEffect(() => { const t = setTimeout(() => setBooting(false), 700); return () => clearTimeout(t); }, []);
  useEffect(() => { box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const shown = useExits(rows, r => r.key);
  let i = -1;
  return (
    <div ref={box} className={`n-list ${className}`} role="listbox" aria-label={label}>
      {shown.map(({ item: r, key, gone }) => {
        const at = gone ? -1 : ++i;
        return (
          <button key={gone ? `gone:${key}` : key} type="button" role="option" aria-selected={at === selected} className={`n-row ${r.mark ?? ''} ${gone ? 'gone' : ''}`}
            tabIndex={gone ? -1 : undefined} aria-hidden={gone || undefined}
            style={booting ? { animationDelay: `${at * 60}ms` } : undefined} {...(gone ? {} : r.bind ?? { onClick: () => onPick?.(at) })}>
            <span className="n-cur" />
            {r.mark === 'add' ? <span aria-hidden="true">+</span> : <span className="sq" />}
            <span key={`n:${r.sig ?? ''}`} className={`nm ${r.sig !== undefined && !booting ? 'n-val' : ''}`}>{r.label}{r.note && <em>{r.note}</em>}</span>
            <small key={`v:${r.sig ?? ''}`} className={r.sig !== undefined && !booting ? 'n-val' : ''}>{r.side}</small>
          </button>
        );
      })}
    </div>
  );
}
