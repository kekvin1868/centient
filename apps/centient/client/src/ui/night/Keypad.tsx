// Cash App's keypad: a big amount over a 3×4 grid. Rupiah only, in whole rupiah (IDR has no minor digits), so
// the digits typed are the minor units. A keyboard can also type a sum (+ - * x / ( )); it shows above the result.
// pressKey() is pure; keypadKey() maps a keyboard press onto it; keypadValue() reads what was typed.
import { evalAmount } from '../../lib/amount';
import { formatMoney } from '../../lib/format';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
const MAX_DIGITS = 12;

const OPS = '+-*/()';

/** The text after pressing `k`, or null when the press is refused (a number too long, a leading zero). */
export function pressKey(digits: string, k: string): string | null {
  if (k === '⌫') return digits.slice(0, -1);
  if (k === 'clear') return '';
  if (OPS.includes(k)) return digits + k;
  const tail = digits.match(/\d*$/)![0]; // the number being typed
  if (tail.length + k.length > MAX_DIGITS || (!tail && /^0+$/.test(k))) return null;
  return digits + k;
}

/** What was typed, in rupiah: 0 when nothing, null when a sum can't be worked out (or is below zero). */
export const keypadValue = (digits: string) => (digits ? evalAmount(digits, 'IDR') : 0);

/** Keyboard: digits, K adds 000, J or M adds 000000 (rb / jt), + - * x / ( ) for sums, Backspace, Delete clears. */
export function keypadKey(e: KeyboardEvent): string | null {
  const k = e.key.toLowerCase();
  if (/^\d$/.test(k)) return k;
  if (OPS.includes(k)) return k;
  if (k === 'x') return '*';
  if (k === 'k') return '000';
  if (k === 'j' || k === 'm') return '000000';
  if (k === 'backspace') return '⌫';
  if (k === 'delete') return 'clear';
  return null;
}

/** The longest start of a sum that works out, with its open brackets closed; 0 when none does. */
function soFar(digits: string) {
  for (let n = digits.length - 1; n > 0; n--) {
    const t = digits.slice(0, n);
    const open = t.split('(').length - t.split(')').length;
    const v = open >= 0 ? evalAmount(t + ')'.repeat(open), 'IDR') : null;
    if (v !== null) return v;
  }
  return 0;
}

export function Keypad({ digits, onPress, empty, refused = 0 }: { digits: string; onPress: (k: string) => void; empty: string; refused?: number }) {
  const sum = /\D/.test(digits);
  const v = keypadValue(digits);
  // A half-typed sum shows what it comes to so far (never "?": ??? means "not set" here); the sum line turns pink.
  const shown = !digits ? null : formatMoney(v ?? soFar(digits)).replace(/^Rp/, '');
  const size = !shown ? 56 : shown.length > 9 ? 34 : shown.length > 6 ? 44 : 56;
  return (
    <>
      {sum && <div className={`k-sum ${v === null ? 'bad' : ''}`}>{digits.replace(/\*/g, '×').replace(/\//g, '÷')}</div>}
      <div key={refused} className={`k-amt money ${shown ? '' : 'unk'} ${refused ? 'shake' : ''}`} style={{ fontSize: size }} aria-live="polite">
        {shown ? <><span className="cur">Rp</span>{shown}</> : empty}
      </div>
      <div className="k-keys">
        {KEYS.map(k => <button key={k} type="button" aria-label={k === '⌫' ? 'Delete' : k} onClick={() => onPress(k)}>{k}</button>)}
      </div>
    </>
  );
}
