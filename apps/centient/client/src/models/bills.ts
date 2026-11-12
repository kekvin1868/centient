// A person's split bills (what each Paid back can pay) and the divide dialog's maths: one HP bar per bill, filled
// oldest first, a pool of what is not placed yet.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Res } from './api';

export type TabBill = Res<(typeof client.api.accounts)[':id']['bills']['$get']>[number];

export const billQueries = {
  all: () => ['entries', 'bills'] as const,
  /** `except`: the Paid back being edited, so its own links count as not paid yet. */
  ofTab: (tabId: string, except?: string) =>
    queryOptions({
      queryKey: [...billQueries.all(), tabId, except ?? null],
      queryFn: () =>
        call(client.api.accounts[':id'].bills.$get({ param: { id: tabId }, query: { except } })),
    }),
};

/** One bar: a bill and how much of this Paid back goes to it. `left` = what the bill still needs from this person. */
export type Bar = { id: string; title: string; date: string; left: number; amount: number };

/** Bills with something left, oldest first, as empty bars. */
export const openBars = (bills: TabBill[]): Bar[] =>
  bills
    .filter(b => b.share > b.paid)
    .map(b => ({
      id: b.entryId,
      title: b.title,
      date: b.occurredAt.slice(0, 10),
      left: b.share - b.paid,
      amount: 0,
    }));

/** Where a Paid back starts: the account and pocket of the oldest bill still owed (else the newest bill). */
export function billSource(bills: TabBill[]) {
  const b = bills.find(x => x.share > x.paid) ?? bills.at(-1);
  return b?.accountId ? { accountId: b.accountId, envelopeId: b.envelopeId } : null;
}

/** Oldest bill first: each bar takes what it still needs until the money runs out. */
export function fillOldestFirst(bars: Bar[], total: number): Bar[] {
  let pool = total;
  return bars.map(b => {
    const amount = Math.max(0, Math.min(b.left, pool));
    pool -= amount;
    return { ...b, amount };
  });
}

/** What is not placed on any bar yet. */
export const poolOf = (bars: Bar[], total: number) =>
  total - bars.reduce((s, b) => s + b.amount, 0);

/** Moves one bar to `value`: never below 0, above what the bill needs, or past what the pool can give. */
export function setBar(bars: Bar[], id: string, value: number, total: number): Bar[] {
  return bars.map(b => {
    if (b.id !== id) return b;
    const room = poolOf(bars, total) + b.amount;
    return { ...b, amount: Math.max(0, Math.min(Math.round(value), b.left, room)) };
  });
}

/** Save works once every rupiah is placed, or every bar is full (the rest is extra). */
export const canSave = (bars: Bar[], total: number) =>
  poolOf(bars, total) === 0 || bars.every(b => b.amount === b.left);

/**
 * The links a Paid back saves: bars with money, never more in all than `max` (the amount minus a gift). Over it, the
 * newest bills give up the difference first.
 */
export function linksOf(bars: Bar[], max: number) {
  let room = max;
  return bars
    .map(b => {
      const amount = Math.min(b.amount, Math.max(0, room));
      room -= amount;
      return { entryId: b.id, amount };
    })
    .filter(l => l.amount > 0);
}
