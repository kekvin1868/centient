// Money helpers shared by the Worker, the quick-add parser and (later) the receipt amount check.
// Amounts are integers in the currency's minor units; IDR has 0 decimals.

export const DECIMALS: Record<string, number> = { IDR: 0, USD: 2, USDT: 6, BTC: 8 };

/**
 * Parses a written number the way Indonesians and English dictation write it.
 * A "." or "," followed by exactly three digits groups thousands (52.500, 25,000);
 * a final separator followed by one or two digits is a decimal (1,5 / 1.5 / 52.500,00).
 */
export function parseNumber(s: string): number | null {
  const m = s.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  return Number(`${m[1].replace(/[.,]/g, '')}.${m[2] ?? '0'}`);
}

const SUFFIX: Record<string, number> = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6 };

export type Amount =
  | { kind: 'exact'; value: number }
  // A bare small number ("100") or an ambiguous Hokkien word: the caller picks a magnitude.
  | { kind: 'inferred'; candidates: number[] }
  // "M" is million in English and miliar in Indonesian, so it is never guessed.
  | { kind: 'ambiguous_m'; value: number };

/**
 * Parses one amount token: optional Rp / Rp. / IDR prefix, a number, optional suffix
 * (rb, ribu, k, jt, juta, any case). Returns null when the token is not an amount.
 * With a prefix a small number is taken literally ("Rp100" is Rp100).
 */
export function parseAmount(token: string): Amount | null {
  const m = token.trim().toLowerCase().match(/^(rp\.?\s?|idr\s?)?(\d[\d.,]*)\s?(rb|ribu|k|jt|juta|m)?$/);
  if (!m) return null;
  const n = parseNumber(m[2]);
  if (n === null) return null;
  const [, prefix, , suffix] = m;
  if (suffix === 'm') return { kind: 'ambiguous_m', value: n };
  if (suffix) return { kind: 'exact', value: Math.round(n * SUFFIX[suffix]) };
  if (!prefix && Number.isInteger(n) && n < 1000) return { kind: 'inferred', candidates: [n, n * 1e3, n * 1e6] };
  return { kind: 'exact', value: Math.round(n) };
}

/** "Rp52,500" for IDR; "USD 10.00" for the rest. English UI, so commas group thousands. */
export function formatMoney(minor: number, currency = 'IDR'): string {
  const d = DECIMALS[currency] ?? 0;
  const major = minor / 10 ** d;
  const s = Math.abs(major).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = minor < 0 ? '-' : '';
  return currency === 'IDR' ? `${sign}Rp${s}` : `${sign}${currency} ${s}`;
}

/** Major units typed in a form ("10.5") to minor units (1050 for USD). */
export function toMinor(major: number, currency = 'IDR'): number {
  return Math.round(major * 10 ** (DECIMALS[currency] ?? 0));
}
