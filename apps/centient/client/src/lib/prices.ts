// Showing crypto balances in rupiah: the value of an amount at a price, and how old the price is. The prices
// themselves come from models/price (usePrices).
import { DECIMALS } from '@centient/money';
import type { Prices } from '../models/price';

/** Rupiah value (minor units) of an amount, or null when its currency has no price. IDR is itself. */
export function idrValue(minor: number, currency: string, p: Prices): number | null {
  if (currency === 'IDR') return minor;
  const price = p[currency];
  if (!price) return null;
  return Math.round((minor / 10 ** (DECIMALS[currency] ?? 0)) * price.idrPerUnit);
}

/** "as of 14:05" (today, Jakarta) or "as of 21 Oct"; `stale` once older than 10 minutes. */
export function priceAge(currency: string, p: Prices, now = Date.now()) {
  const at = p[currency]?.fetchedAt;
  if (!at) return null;
  const d = new Date(at);
  const sameDay =
    d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) ===
    new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const when = sameDay
    ? d.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
      })
    : d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
  return { label: `as of ${when}`, stale: now - d.getTime() > 10 * 60_000 };
}
