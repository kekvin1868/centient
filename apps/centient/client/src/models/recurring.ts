// Recurring bills (subscriptions and other bills that leave on a date): what the API sends, how they load and
// save, and how a due date reads. Home reads this, so it stays small: the form is ./recurringForm. Split bills
// are another thing: see ./bills.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';
import { paidTicket } from '../../../src/domain/tickets';
import { billMonth, daysBetween } from './dates';
import { sliceBill } from '../../../src/domain/cardBill';
import type { OutboxItem } from './outbox';

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

/** One line of a card bill, in the bank's order. */
export type BillLine = {
  key: string;
  /** What kind of line: the tag on the receipt. */
  kind: 'carry' | 'credit' | 'spent' | 'slice' | 'interest';
  /** The whole line in words (its accessible name), and the part after the tag. */
  label: string;
  detail: string;
  amount: number;
  paid?: boolean;
  /** Tapping it opens this plan (an installment) or this entry (interest). */
  planId?: string;
  entryId?: string;
};

/** A card bill's lines: unpaid (or paid extra) from the bill before, spending, each plan's slice, interest. */
export function billLines(card: CardStatement): BillLine[] {
  const { carry, spent, slices, interest } = card.lines;
  const before = card.before ? billMonth(card.before) : 'last';
  const lines: BillLine[] = [];
  if (carry > 0)
    lines.push({
      key: 'carry',
      kind: 'carry',
      label: `Unpaid from ${before}`,
      detail: `from the ${before} bill`,
      amount: carry,
    });
  if (carry < 0)
    lines.push({
      key: 'carry',
      kind: 'credit',
      label: `Paid extra on ${before}`,
      detail: `paid extra on the ${before} bill`,
      amount: carry,
    });
  if (spent)
    lines.push({
      key: 'spent',
      kind: 'spent',
      label: 'Spending',
      detail: 'on the card',
      amount: spent,
    });
  for (const s of slices)
    lines.push({
      key: `slice:${s.planId}:${s.no}`,
      kind: 'slice',
      label: `${s.name} · installment ${s.no} of ${s.of}`,
      detail: `${s.name} · ${s.no} of ${s.of}`,
      amount: s.amount,
      paid: s.paid,
      planId: s.planId,
    });
  for (const i of interest) {
    const detail = i.from
      ? `on unpaid ${billMonth(i.from)}`
      : `${i.planName ?? 'plan'}${i.no ? ` installment ${i.no}` : ''}`;
    lines.push({
      key: `interest:${i.entryId}`,
      kind: 'interest',
      label: `Interest · ${detail}`,
      detail,
      amount: i.amount,
      entryId: i.entryId,
    });
  }
  return lines;
}

/** A choice for "Charged on" in Log interest. */
export type InterestSource = { key: string; label: string; from: Interest['from'] };

/**
 * Where the server lets this bill's interest come from (`interestFrom`), as choices: only the ones with no
 * hand-typed line on this bill yet (one per source per bill; the server refuses a second, INTEREST_LOGGED).
 */
export function interestSources(card: CardStatement): InterestSource[] {
  const { month, plans } = card.interestFrom;
  const typed = card.lines.interest;
  return [
    ...(month && !typed.some(l => l.from === month)
      ? [{ key: `m:${month}`, label: `On unpaid ${billMonth(month)}`, from: { month } }]
      : []),
    ...plans
      .filter(p => !typed.some(l => l.planId === p.id && l.no === null))
      .map(p => ({ key: `p:${p.id}`, label: p.name, from: { planId: p.id } })),
  ];
}

/** Paid more than the bill (a line removed after paying it): that much counts toward the next bill. */
export const paidExtra = (card: CardStatement) => Math.max(0, card.paidSince - card.bill);

/**
 * Home's "After card bills": your money less what is left to pay of each printed card bill and what was spent on
 * the cards since they closed (it is on the next bill). Future slices are left out. Only the cards in `currency`.
 */
export function afterCardBills(
  money: number,
  cards: CardStatement[],
  inCurrency: (accountId: string) => boolean,
) {
  const owed = cardsOwed(cards, inCurrency).reduce((s, c) => s + c.left + c.spentSince, 0);
  return owed ? money - owed : null;
}

/** What "After card bills" takes off, card by card (its breakdown sheet): only cards that owe something. */
export function cardsOwed(cards: CardStatement[], inCurrency: (accountId: string) => boolean) {
  return cards
    .filter(c => inCurrency(c.accountId))
    .map(c => ({ accountId: c.accountId, left: c.left, spentSince: Math.max(0, c.spentSince) }))
    .filter(c => c.left + c.spentSince > 0);
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

// ---- The bank's statement ("Enter statement") ----

export type Statement = { total: number; minimum: number | null };

/**
 * What the statement says for this bill: one still waiting in the outbox (typed, not sent yet) over the server's.
 * A refused one is not shown here (it is under Not sent).
 */
export function statementOf(card: CardStatement, items: OutboxItem[]): Statement | null {
  const mine = items.findLast(
    i =>
      i.op === 'statement' &&
      i.entryId === `statement:${card.accountId}:${card.cutOff}` &&
      (i.state === 'waiting' || i.state === 'sending'),
  );
  return mine ? { total: mine.statement!.total, minimum: mine.statement!.minimum } : card.statement;
}

/**
 * The statement's total against the app's bill (plus interest typed but not logged yet): `gap` > 0 = the bank asks
 * more (something is not in the app), < 0 = the app has more, 0 = they match.
 */
export const statementGap = (card: CardStatement, total: number, typedInterest = 0) =>
  total - (card.bill + typedInterest);

/** The month after the bill's: where what is left of it carries to. */
export const nextBillName = (card: CardStatement) =>
  billMonth(sliceBill({ firstBill: card.cutOff.slice(0, 7) }, 2));

/**
 * How the payments so far stand against the statement's minimum (none without one, or once paid in full):
 * paid at least the minimum, or something paid but under it.
 */
export function minimumState(card: CardStatement, st: Statement | null) {
  if (!st?.minimum || card.left === 0 || card.paidSince === 0) return null;
  return card.paidSince >= st.minimum
    ? ({ kind: 'minimum', carries: card.left } as const)
    : ({ kind: 'below', short: st.minimum - card.paidSince } as const);
}
