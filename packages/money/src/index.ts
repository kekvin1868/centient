// Money helpers shared by the Worker, the quick-add parser and (later) the receipt amount check.
// Amounts are integers in the currency's minor units; IDR has 0 decimals.
import { CURRENCIES } from './currencies';

export { CURRENCIES, type Currency } from './currencies';

/** Decimals per listed currency code (IDR 0, USD 2, JPY 0, KWD 3, USDT 6, BTC 8, ...). */
export const DECIMALS: Record<string, number> = Object.fromEntries(CURRENCIES.map(c => [c.code, c.decimals]));

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

/** Currency words accepted before or after a number. Rupiah words keep the rupiah rules below. */
export const CURRENCY_WORDS: Record<string, string> = {
  rp: 'IDR', 'rp.': 'IDR', idr: 'IDR', $: 'USD', us$: 'USD', usd: 'USD', usdt: 'USDT', btc: 'BTC', eur: 'EUR', jpy: 'JPY',
};

export type Amount =
  // `currency` is set only for a non-rupiah amount; `value` is then in that currency's minor units.
  | { kind: 'exact'; value: number; currency?: string }
  // A bare small number ("100") or an ambiguous Hokkien word: the caller picks a magnitude.
  | { kind: 'inferred'; candidates: number[] }
  // "M" is million in English and miliar in Indonesian, so it is never guessed.
  | { kind: 'ambiguous_m'; value: number };

/** Foreign amounts are often decimals: "0.001" or "20.5" is a decimal, "1,500" still groups thousands. */
function parseForeignNumber(s: string): number | null {
  const m = s.match(/^(\d+)[.,](\d+)$/);
  if (m && (m[1] === '0' || m[2].length !== 3)) return Number(`${m[1]}.${m[2]}`);
  return parseNumber(s);
}

/**
 * Parses one amount token: optional currency prefix (Rp, Rp., IDR, $, US$, USD, USDT, BTC, EUR, JPY), a number,
 * optional suffix (rb, ribu, k, jt, juta, or a currency word), any case. Returns null when the token
 * is not an amount. With a prefix a small rupiah number is taken literally ("Rp100" is Rp100).
 */
export function parseAmount(token: string): Amount | null {
  const m = token.trim().toLowerCase().match(/^(rp\.?|idr|us\$|\$|usdt|usd|btc|eur|jpy)?\s?(\d[\d.,]*)\s?(rb|ribu|k|jt|juta|m|usdt|usd|btc|eur|jpy)?$/);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  const prefixCur = prefix ? CURRENCY_WORDS[prefix] : undefined;
  const suffixCur = suffix ? CURRENCY_WORDS[suffix] : undefined;
  if (prefixCur && suffixCur && prefixCur !== suffixCur) return null;
  const currency = prefixCur ?? suffixCur ?? 'IDR';
  if (currency !== 'IDR') {
    const n = parseForeignNumber(digits);
    if (n === null) return null;
    const major = n * (suffix && SUFFIX[suffix] ? SUFFIX[suffix] : 1);
    return { kind: 'exact', value: Math.round(major * 10 ** (DECIMALS[currency] ?? 0)), currency };
  }
  const n = parseNumber(digits);
  if (n === null) return null;
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
