// Receipt paper for entries: torn top and bottom edges, mono type, lines with dotted leaders. A line's value
// is tappable: the native control (select, date) lies invisibly over the whole line.
import type { ReactNode } from 'react';

export function Receipt({ stamp, children }: { stamp?: string; children: ReactNode }) {
  return (
    <div className="receipt-stage mx-4 my-4">
      <div className="receipt">
        {stamp && <span className="receipt-stamp" aria-hidden="true">{stamp}</span>}
        {children}
      </div>
    </div>
  );
}

export const Rule = () => <hr className="my-4 border-0 border-t-2 border-dashed border-[color-mix(in_oklab,var(--paper-ink)_28%,transparent)]" />;

/** A "LABEL ........ value ▾" line; `control` is the invisible native input laid over it. */
export function ReceiptLine({ label, value, control, empty }: { label: string; value: ReactNode; control?: ReactNode; empty?: boolean }) {
  return (
    <div className="relative flex items-baseline gap-1.5 py-[7px]">
      <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">{label}</span>
      <span className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)]" aria-hidden="true" />
      <span className={`min-w-0 truncate font-bold ${empty ? 'text-[var(--paper-faint)]' : ''}`}>{value}{control && <span className="text-[10px] text-[var(--paper-faint)]"> ▾</span>}</span>
      {control}
    </div>
  );
}

/** A select laid over a receipt line. */
export function LineSelect({ label, value, options, placeholder, onChange }: {
  label: string; value: string | null; options: { value: string; label: string }[]; placeholder?: string; onChange: (v: string | null) => void;
}) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)}
      className="absolute inset-0 w-full cursor-pointer opacity-0 [font-size:16px]">
      {(placeholder || !value) && <option value="">{placeholder ?? 'Pick one'}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
