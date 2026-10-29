// Typed amounts: shown with grouping while typing (25.000) and read back as integer minor units. A typed sum
// ("1.500.000*3 + (200.000/4)") is worked out with the usual order: brackets, then × ÷, then + −.
import { DECIMALS } from '@centient/money';

export const showAmount = (minor: number | null, cur: string) => {
  if (minor === null) return '';
  const d = DECIMALS[cur] ?? 0;
  return (minor / 10 ** d).toLocaleString(cur === 'IDR' ? 'id-ID' : 'en-US', { maximumFractionDigits: d });
};

/** Rupiah: every non-digit is grouping. Others: the last "." or "," is the decimal point. */
function readAmount(raw: string, cur: string): number | null {
  const d = DECIMALS[cur] ?? 0;
  if (cur === 'IDR') { const n = raw.replace(/\D/g, ''); return n ? Number(n) : null; }
  const m = raw.replace(/[^\d.,]/g, '').match(/^(.*?)(?:[.,](\d*))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return Math.round(Number(`${m[1].replace(/[.,]/g, '') || '0'}.${m[2] ?? '0'}`) * 10 ** d);
}

const OPS: Record<string, string> = { '+': '+', '-': '-', '−': '-', '*': '*', x: '*', X: '*', '×': '*', '/': '/', ':': '/', '÷': '/', '(': '(', ')': ')' };
const isSum = (raw: string) => [...raw].some(c => c in OPS);

/** A typed sum in minor units; null when it is empty, malformed, below zero or divides by zero. Numbers are read
 * like plain amounts (so "1.500.000" stays one number in rupiah). No unary minus: amounts are never negative. */
export function evalAmount(raw: string, cur: string): number | null {
  const d = DECIMALS[cur] ?? 0;
  const tokens = raw.replace(/\s+/g, '').match(/[\d.,]+|./g) ?? [];
  let i = 0;
  // Each level returns the value in major units, or NaN when the text doesn't parse.
  const atom = (): number => {
    const t = tokens[i++];
    if (t === undefined) return NaN;
    if (OPS[t] === '(') { const v = sum(); return OPS[tokens[i++]] === ')' ? v : NaN; }
    const minor = /^[\d.,]+$/.test(t) ? readAmount(t, cur) : null;
    return minor === null ? NaN : minor / 10 ** d;
  };
  const product = (): number => {
    let v = atom();
    while (OPS[tokens[i]] === '*' || OPS[tokens[i]] === '/') {
      const op = OPS[tokens[i++]], r = atom();
      v = op === '*' ? v * r : r === 0 ? NaN : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (OPS[tokens[i]] === '+' || OPS[tokens[i]] === '-') v = OPS[tokens[i++]] === '+' ? v + product() : v - product();
    return v;
  };
  if (!tokens.length) return null;
  const v = sum();
  if (i !== tokens.length || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 10 ** d);
}

/** State for an amount input: the text as typed, and its minor units. A sum keeps its text as typed (`sum`), and
 * `invalid` marks one that can't be worked out. */
export const amountInput = (text: string, cur: string) => {
  if (isSum(text)) {
    const minor = evalAmount(text, cur);
    return { minor, text, sum: true, invalid: minor === null && text.trim() !== '' };
  }
  const minor = readAmount(text, cur);
  return { minor, text: cur === 'IDR' && minor !== null ? showAmount(minor, cur) : text, sum: false, invalid: false };
};
