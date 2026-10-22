// Crypto prices in rupiah, for showing what a BTC / USDT balance is worth. The server refreshes them every
// 10 minutes and serves the last known one when the price service is down; the client also keeps the last
// answer on the device, so values still show (marked with their time) when there is no connection.
import { DECIMALS } from '@centient/money';
import { signal } from '@preact/signals-react';
import { call, client } from '../api';
import { load, save } from './storage';

export type Prices = Record<string, { idrPerUnit: number; fetchedAt: string }>;
export const prices = signal<Prices>(load('prices', {}));

export async function loadPrices() {
  try {
    prices.value = await call(client.api.prices.$get()) as Prices;
    save('prices', prices.value);
  } catch {
    // Offline or server error: keep the last known prices (already loaded from the device).
  }
}

/** Rupiah value (minor units) of an amount, or null when its currency has no price. IDR is itself. */
export function idrValue(minor: number, currency: string, p: Prices = prices.value): number | null {
  if (currency === 'IDR') return minor;
  const price = p[currency];
  if (!price) return null;
  return Math.round((minor / 10 ** (DECIMALS[currency] ?? 0)) * price.idrPerUnit);
}

/** "as of 14:05" (today, Jakarta) or "as of 21 Oct"; `stale` once older than 10 minutes. */
export function priceAge(currency: string, now = Date.now(), p: Prices = prices.value) {
  const at = p[currency]?.fetchedAt;
  if (!at) return null;
  const d = new Date(at);
  const sameDay = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const when = sameDay
    ? d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
  return { label: `as of ${when}`, stale: now - d.getTime() > 10 * 60_000 };
}
