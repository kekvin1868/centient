// Typed amounts: shown with grouping while typing (25.000) and read back as integer minor units.
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

/** State for an amount input: the text as typed, and onChange(minor) as it changes. */
export const amountInput = (text: string, cur: string) => {
  const minor = readAmount(text, cur);
  return { minor, text: cur === 'IDR' && minor !== null ? showAmount(minor, cur) : text };
};
