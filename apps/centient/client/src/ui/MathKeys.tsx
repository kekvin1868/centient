// Amount inputs that take sums ("25.000 x 4"). The phone's number pad has no operators, so while the field is
// focused a row of them shows under it; they type at the caret and never take focus, so the keyboard stays up.
// A sum keeps its text as typed with "= Rp 100.000" under it, and becomes the grouped result on blur.
import { DECIMALS } from '@centient/money';
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { amountInput, showAmount } from '../lib/amount';
import { formatMoney } from '../lib/format';

const KEYS = ['+', '−', '×', '÷', '(', ')', '⌫'];

/** Props for the <input>, and what goes under it (the result line and the operator row). */
export function useSumInput(value: number | null, currency: string, onChange: (minor: number | null) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(showAmount(value, currency));
  const [focused, setFocused] = useState(false);
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A new value from outside (or a new currency) replaces the text; our own typing already matches it.
  useEffect(() => { if (amountInput(text, currency).minor !== value) setText(showAmount(value, currency)); }, [value, currency]);
  useEffect(() => () => clearTimeout(leaving.current), []);
  const r = amountInput(text, currency);
  const input = {
    ref, value: text, inputMode: (DECIMALS[currency] ? 'decimal' : 'numeric') as 'decimal' | 'numeric',
    onChange: (e: ChangeEvent<HTMLInputElement>) => { const n = amountInput(e.target.value, currency); setText(n.text); onChange(n.minor); },
    onFocus: () => { clearTimeout(leaving.current); setFocused(true); },
    // Blur comes before the click of the tap that caused it: collapsing the row at once would move what was tapped.
    onBlur: () => {
      leaving.current = setTimeout(() => { setFocused(false); if (r.sum && r.minor !== null) setText(showAmount(r.minor, currency)); }, 250);
    },
  };
  const below = (
    <>
      {r.sum && (
        <span className={`num block text-[15px] font-semibold ${r.invalid ? 'text-negative' : 'text-muted'}`} aria-live="polite">
          {r.invalid ? 'Check the amount' : `= ${formatMoney(r.minor!, currency)}`}
        </span>
      )}
      {focused && <MathKeys input={ref} />}
    </>
  );
  return { input, below, text };
}

function MathKeys({ input }: { input: RefObject<HTMLInputElement | null> }) {
  const row = useRef<HTMLSpanElement>(null);
  useEffect(() => { row.current?.scrollIntoView({ block: 'nearest' }); }, []);
  const type = (k: string) => {
    const el = input.current;
    if (!el) return;
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
    if (k === '⌫') el.setRangeText('', s === e ? Math.max(0, s - 1) : s, e, 'end');
    else el.setRangeText(k, s, e, 'end');
    // setRangeText skips React's value tracking, so this input event reaches onChange.
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return (
    <span ref={row} className="mt-2 flex gap-1.5" role="group" aria-label="Math keys">
      {KEYS.map(k => (
        <button key={k} type="button" aria-label={k === '⌫' ? 'Delete' : k} tabIndex={-1}
          onPointerDown={e => { e.preventDefault(); type(k); }}
          className="panel grid h-10 flex-1 place-items-center rounded-[3px] bg-raised text-[18px] font-bold text-ink active:opacity-70">{k}</button>
      ))}
    </span>
  );
}
