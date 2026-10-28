// Cash App's keypad: a big amount over a 3×4 grid. Rupiah only, in whole rupiah (IDR has no minor digits), so
// the digits typed are the minor units. pressKey() is pure; keypadKey() maps a keyboard press onto it.
import { formatMoney } from '../../lib/format';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
const MAX_DIGITS = 12;

/** The digits after pressing `k`, or null when the press is refused (too long, leading zero). */
export function pressKey(digits: string, k: string): string | null {
  if (k === '⌫') return digits.slice(0, -1);
  if (k === 'clear') return '';
  if (digits.length + k.length > MAX_DIGITS || (!digits && /^0+$/.test(k))) return null;
  return digits + k;
}

/** Keyboard: digits, K adds 000, J or M adds 000000 (rb / jt), Backspace, Delete clears. */
export function keypadKey(e: KeyboardEvent): string | null {
  const k = e.key.toLowerCase();
  if (/^\d$/.test(k)) return k;
  if (k === 'k') return '000';
  if (k === 'j' || k === 'm') return '000000';
  if (k === 'backspace') return '⌫';
  if (k === 'delete') return 'clear';
  return null;
}

export function Keypad({ digits, onPress, empty, refused = 0 }: { digits: string; onPress: (k: string) => void; empty: string; refused?: number }) {
  const shown = digits ? formatMoney(Number(digits)).replace(/^Rp/, '') : null;
  const size = !shown ? 56 : shown.length > 9 ? 34 : shown.length > 6 ? 44 : 56;
  return (
    <>
      <div key={refused} className={`k-amt money ${shown ? '' : 'unk'} ${refused ? 'shake' : ''}`} style={{ fontSize: size }} aria-live="polite">
        {shown ? <><span className="cur">Rp</span>{shown}</> : empty}
      </div>
      <div className="k-keys">
        {KEYS.map(k => <button key={k} type="button" aria-label={k === '⌫' ? 'Delete' : k} onClick={() => onPress(k)}>{k}</button>)}
      </div>
    </>
  );
}
