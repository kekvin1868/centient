// Typed sums ("1.500.000*3 + (200.000/4)", "19k/3"), worked out with the usual order: brackets, then × ÷, then
// + −. One engine for the amount fields, the keypad and the log box. A number may carry a rupiah unit (rb, ribu,
// k, jt, juta; "1,5jt"), read like a quick add amount.
import { DECIMALS, parseNumber, SUFFIX } from './index';

/** Rupiah: every non-digit is grouping. Others: the last "." or "," is the decimal point. */
export function readAmount(raw: string, cur: string): number | null {
  const d = DECIMALS[cur] ?? 0;
  if (cur === 'IDR') {
    const n = raw.replace(/\D/g, '');
    return n ? Number(n) : null;
  }
  const m = raw.replace(/[^\d.,]/g, '').match(/^(.*?)(?:[.,](\d*))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return Math.round(Number(`${m[1].replace(/[.,]/g, '') || '0'}.${m[2] ?? '0'}`) * 10 ** d);
}

const OPS: Record<string, string> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  x: '*',
  X: '*',
  '×': '*',
  '/': '/',
  ':': '/',
  '÷': '/',
  '(': '(',
  ')': ')',
};
export const isSum = (raw: string) => [...raw].some(c => c in OPS);

/** A typed sum in minor units; null when it is empty, malformed, below zero or divides by zero. Numbers are read
 * like plain amounts (so "1.500.000" stays one number in rupiah). No unary minus: amounts are never negative. */
export function evalAmount(raw: string, cur: string): number | null {
  const d = DECIMALS[cur] ?? 0;
  const tokens = raw.replace(/\s+/g, '').match(/[\d.,]+(?:ribu|rb|jt|juta|k)?|./gi) ?? [];
  let i = 0;
  // Each level returns the value in major units, or NaN when the text doesn't parse.
  const atom = (): number => {
    const t = tokens[i++];
    if (t === undefined) return NaN;
    if (OPS[t] === '(') {
      const v = sum();
      return OPS[tokens[i++]] === ')' ? v : NaN;
    }
    const unit = t.match(/^([\d.,]+)(ribu|rb|jt|juta|k)$/i);
    if (unit) return (parseNumber(unit[1]) ?? NaN) * SUFFIX[unit[2].toLowerCase()];
    const minor = /^[\d.,]+$/.test(t) ? readAmount(t, cur) : null;
    return minor === null ? NaN : minor / 10 ** d;
  };
  const product = (): number => {
    let v = atom();
    while (OPS[tokens[i]] === '*' || OPS[tokens[i]] === '/') {
      const op = OPS[tokens[i++]],
        r = atom();
      v = op === '*' ? v * r : r === 0 ? NaN : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (OPS[tokens[i]] === '+' || OPS[tokens[i]] === '-')
      v = OPS[tokens[i++]] === '+' ? v + product() : v - product();
    return v;
  };
  if (!tokens.length) return null;
  const v = sum();
  if (i !== tokens.length || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 10 ** d);
}
