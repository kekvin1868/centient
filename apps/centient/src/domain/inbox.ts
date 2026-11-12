// The Inbox's rules: which saved entry an incoming payment may duplicate. Pure; dates are YYYY-MM-DD.
import { daysBetween } from './forecast';

export type Incoming = { accountId: string; amount: number; date: string };
export type Line = { entryId: string; accountId: string; amount: number; day: string };

/**
 * For each incoming payment, the entry it looks like: same account, same signed amount, at most a day apart
 * (the nearest day wins). An entry is offered to one payment only, so two coffees at the same price need two entries.
 */
export function suggestDuplicates(incoming: Incoming[], lines: Line[]): (string | null)[] {
  const taken = new Set<string>();
  return incoming.map(p => {
    const match = lines
      .filter(
        l =>
          !taken.has(l.entryId) &&
          l.accountId === p.accountId &&
          l.amount === p.amount &&
          Math.abs(daysBetween(l.day, p.date)) <= 1,
      )
      .sort(
        (a, b) => Math.abs(daysBetween(a.day, p.date)) - Math.abs(daysBetween(b.day, p.date)),
      )[0];
    if (!match) return null;
    taken.add(match.entryId);
    return match.entryId;
  });
}
