// Display formatting and the plain words the UI uses instead of engineering terms.
import { DECIMALS } from '@centient/money';

/** Rupiah the Indonesian way (Rp25.000); other currencies keep their decimals (USD 20.50, BTC 0.001). */
export function formatMoney(minor: number, currency = 'IDR'): string {
  const sign = minor < 0 ? '-' : '';
  const d = DECIMALS[currency] ?? 0;
  const major = Math.abs(minor) / 10 ** d;
  if (currency === 'IDR') return `${sign}Rp${major.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
  const s = major.toLocaleString('en-US', { minimumFractionDigits: currency === 'USD' ? 2 : 0, maximumFractionDigits: d });
  return `${sign}${currency} ${s}`;
}

export const ACCOUNT_KINDS: Record<string, string> = {
  BANK: 'Bank', DEBIT_CARD: 'Debit card', EWALLET: 'E-wallet', CASH: 'Cash', CREDIT_CARD: 'Credit card', PAYLATER: 'Pay later',
  EXCHANGE: 'Crypto exchange', IOU: 'Friends owe you',
};

export const POCKET_KINDS = { SPENDING: 'Spending', SAVINGS: 'Savings', GOAL: 'Goal' } as const;

/** "Today", "Yesterday", else "Mon 12 Oct" (dates are YYYY-MM-DD in Jakarta time). */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  const d = new Date(`${day}T00:00:00Z`);
  if (Date.parse(`${today}T00:00:00Z`) - d.getTime() === 864e5) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Short rupiah for tight spots (Rp150rb, Rp1,8jt, Rp2,5M); other currencies keep formatMoney. */
export function shortMoney(minor: number, currency = 'IDR'): string {
  if (currency !== 'IDR') return formatMoney(minor, currency);
  const sign = minor < 0 ? '-' : '';
  const v = Math.abs(minor);
  const fmt = (n: number, unit: string) => `${sign}Rp${n.toLocaleString('id-ID', { maximumFractionDigits: n < 100 ? 1 : 0 })}${unit}`;
  if (v >= 1e9) return fmt(v / 1e9, 'M');
  if (v >= 1e6) return fmt(v / 1e6, 'jt');
  if (v >= 1e3) return fmt(v / 1e3, 'rb');
  return formatMoney(minor, currency);
}
