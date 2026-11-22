// Recurring bills (subscriptions and other bills that leave on a date): what the API sends, how they load and
// save, and how a due date reads. Home reads this, so it stays small: the form is ./recurringForm. Split bills
// are another thing: see ./bills.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';
import { paidTicket } from '../../../src/domain/tickets';
import { daysBetween } from './dates';

type List = Res<typeof client.api.recurring.$get>;
/** One bill with its due dates for the next 12 months (`dues`, none while paused). */
export type Recurring = List['items'][number];
/** A credit card's or pay later's last statement: what was billed, what is left to pay, what was spent since. */
export type CardStatement = List['cards'][number];
/** A merchant paid about monthly that is not a bill yet ("Found in your entries"). */
export type FoundPayment = Res<typeof client.api.recurring.found.$get>['found'][number];
/** The body of a new bill (an edit takes any part of it). */
export type RecurringBody = Req<typeof client.api.recurring.$post>['json'];
type Patch = Req<(typeof client.api.recurring)[':id']['$patch']>['json'];
type Paid = Req<(typeof client.api.recurring)[':id']['paid']['$post']>['json'];
type Interest = Req<(typeof client.api.recurring.cards)[':accountId']['interest']['$post']>['json'];
const one = client.api.recurring[':id'];

export const recurringQueries = {
  all: () => ['recurring'] as const,
  list: () =>
    queryOptions({
      queryKey: [...recurringQueries.all(), 'list'],
      queryFn: () => call(client.api.recurring.$get()),
    }),
  found: () =>
    queryOptions({
      queryKey: [...recurringQueries.all(), 'found'],
      queryFn: async () => (await call(client.api.recurring.found.$get())).found,
    }),
};

export const recurringApi = {
  create: (json: RecurringBody) => call(client.api.recurring.$post({ json })),
  update: (id: string, json: Patch) => call(one.$patch({ param: { id }, json })),
  remove: (id: string) => call(one.$delete({ param: { id } })),
  /**
   * Logs the payment as an expense and moves the bill to its next due date. `due` (the date being paid) makes
   * the save's ticket: the same bill marked paid twice for the same date (a double tap, a retry) moves it once.
   */
  paid: (id: string, json: Paid, due: string) =>
    call(
      one.paid.$post(
        { param: { id }, json },
        { headers: { 'Idempotency-Key': paidTicket(id, due) } },
      ),
    ),
  /** Undoes a payment: deletes the expense that paid a bill, and the server moves the bill back to that date. */
  unpay: (entryId: string) =>
    call(client.api.entries[':id'].$delete({ param: { id: entryId }, query: {} })),
  /** "Log interest" on a card bill: the bank's interest from the statement, tagged by where it came from. */
  logInterest: (accountId: string, json: Interest) =>
    call(client.api.recurring.cards[':accountId'].interest.$post({ param: { accountId }, json })),
  /** "Not a subscription": this merchant is no longer offered under "Found in your entries". */
  hide: (merchant: string) => call(client.api.recurring.found.hide.$post({ json: { merchant } })),
};

// ---- How bills read on screen ----

/** "Due today", "Due tomorrow", "Due in 5 days", "3 days late". */
export function dueWords(due: string, today: string): string {
  const days = daysBetween(today, due);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return days > 0 ? `Due in ${days} days` : `${-days} day${days === -1 ? '' : 's'} late`;
}

/** A bill's month (YYYY-MM) as the statement names it: "Dec". */
export const billMonth = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

/**
 * Home's "After card bills": your money less what is left to pay of each printed card bill and what was spent on
 * the cards since they closed (it is on the next bill). Future slices are left out. Only the cards in `currency`.
 */
export function afterCardBills(
  money: number,
  cards: CardStatement[],
  inCurrency: (accountId: string) => boolean,
) {
  const owed = cards
    .filter(c => inCurrency(c.accountId))
    .reduce((s, c) => s + c.left + Math.max(0, c.spentSince), 0);
  return owed ? money - owed : null;
}

/** One line of Home's "Coming up": a bill, or a card's statement with money left to pay. */
export type Upcoming = { key: string; due: string } & (
  { kind: 'recurring'; item: Recurring } | { kind: 'card'; card: CardStatement }
);

/** Bills due within `days` (late ones too, paused ones never) and card bills not paid off yet, the soonest first. */
export function comingUp(list: List, days = 7): Upcoming[] {
  const soon = (due: string) => daysBetween(list.today, due) <= days;
  const bills: Upcoming[] = list.items
    .filter(i => !i.paused && soon(i.nextDue))
    .map(item => ({ kind: 'recurring', key: `recurring:${item.id}`, due: item.nextDue, item }));
  const cards: Upcoming[] = list.cards.flatMap(card =>
    card.dueOn && card.left > 0 && soon(card.dueOn)
      ? [{ kind: 'card', key: `card:${card.accountId}`, due: card.dueOn, card }]
      : [],
  );
  return [...bills, ...cards].sort((a, b) => a.due.localeCompare(b.due));
}

/** Which bills fall due on each day of the next 12 months: day -> bills. */
export function dueByDay(items: Recurring[]): Map<string, Recurring[]> {
  const out = new Map<string, Recurring[]>();
  for (const item of items)
    for (const day of item.dues) out.set(day, [...(out.get(day) ?? []), item]);
  return out;
}
