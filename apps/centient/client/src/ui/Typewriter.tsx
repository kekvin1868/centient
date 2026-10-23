// A one-line title typed like a typewriter: no field box, a block cursor at the end, and each new letter
// strikes into place. The real input sits invisibly on top (same mono metrics), so selection, paste and the
// phone keyboard work as usual; with the cursor mid-text the native caret shows instead of the block.
import { useEffect, useRef, useState } from 'react';

export function Typewriter({ label, value, placeholder, onChange, autoFocus }: {
  label: string; value: string; placeholder: string; onChange: (v: string) => void; autoFocus?: boolean;
}) {
  const prev = useRef(value);
  const [focused, setFocused] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  // Letters past the old length are new: only they get the strike (it plays once, when they mount).
  const grew = value.length > prev.current.length && value.startsWith(prev.current);
  const from = grew ? prev.current.length : value.length;
  useEffect(() => { prev.current = value; });
  const size = value.length > 22 ? 'text-[17px]' : value.length > 14 ? 'text-[21px]' : 'text-[26px]';
  const track = (el: HTMLInputElement) => setAtEnd(el.selectionStart === el.value.length);
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-[var(--paper-faint)]">{label}</span>
      <span className={`relative block h-[38px] overflow-hidden whitespace-pre font-bold leading-[38px] tracking-[-0.01em] ${size}`}>
        <input value={value} maxLength={40} autoFocus={autoFocus} autoComplete="off" enterKeyHint="next"
          className="absolute inset-0 w-full bg-transparent p-0 text-transparent outline-none selection:bg-[color-mix(in_oklab,var(--miku)_45%,transparent)]"
          style={{ caretColor: focused && !atEnd ? 'var(--paper-ink)' : 'transparent' }}
          onChange={e => { onChange(e.target.value); track(e.target); }}
          onSelect={e => track(e.currentTarget)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        <span className="pointer-events-none" aria-hidden="true">
          {value
            ? [...value].map((ch, i) => <span key={i} className={`inline-block whitespace-pre ${i >= from ? 'strike' : ''}`}>{ch}</span>)
            : <span className="font-medium text-[var(--paper-faint)]">{placeholder}</span>}
          {focused && atEnd && <span className="typewriter-caret" />}
        </span>
      </span>
    </label>
  );
}
