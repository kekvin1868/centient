// Recurring bills (subscriptions and other bills that leave on a date): what the API sends, how they load and
// save, the form, and how a due date reads. Split bills are another thing: see ./bills.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';
import { daysBetween } from './dates';

type List = Res<typeof client.api.recurring.$get>;
/** One bill with its due dates for the next 12 months (`dues`, none while paused). */
export type Recurring = List['items'][number];
/** A credit card's or pay later's last statement: what was billed, what is left to pay, what was spent since. */
export type CardStatement = List['cards'][number];
/** A merchant paid about monthly that is not a bill yet ("Found in your entries"). */
export type FoundPayment = Res<typeof client.api.recurring.found.$get>['found'][number];
type SaveBody = Req<typeof client.api.recurring.$post>['json'];
type Patch = Req<(typeof client.api.recurring)[':id']['$patch']>['json'];
type Paid = Req<(typeof client.api.recurring)[':id']['paid']['$post']>['json'];
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
  create: (json: SaveBody) => call(client.api.recurring.$post({ json })),
  update: (id: string, json: Patch) => call(one.$patch({ param: { id }, json })),
  remove: (id: string) => call(one.$delete({ param: { id } })),
  /** Logs the payment as an expense and moves the bill to its next due date. */
  paid: (id: string, json: Paid) => call(one.paid.$post({ param: { id }, json })),
  /** "Not a subscription": this merchant is no longer offered under "Found in your entries". */
  hide: (merchant: string) => call(client.api.recurring.found.hide.$post({ json: { merchant } })),
};

// ---- The bill form ----

type Every = SaveBody['everyMonths'];
export const REPEATS: readonly { value: Every; label: string }[] = [
  { value: 1, label: 'Every month' },
  { value: 3, label: 'Every 3 months' },
  { value: 6, label: 'Every 6 months' },
  { value: 12, label: 'Every year' },
];
/** A stored or picked number of months as one the server takes; anything else reads as monthly. */
export const toEvery = (n: number): Every => REPEATS.find(r => r.value === n)?.value ?? 1;
export const repeatWords = (n: number) =>
  REPEATS.find(r => r.value === n)?.label ?? `Every ${n} months`;

export type RecurringForm = {
  name: string;
  /** Key of a known service (features/recurring/services), or null for a name typed by hand. */
  service: string | null;
  accountId: string | null;
  /** null = the account's Main pocket. */
  envelopeId: string | null;
  categoryId: string | null;
  amount: number | null;
  /** The amount changes each time (electricity): none is kept, and Mark paid asks for it. */
  varies: boolean;
  everyMonths: Every;
  nextDue: string;
  /** '' = no end. */
  endsOn: string;
};
/** What a new form may start with (a payment found in the entries already knows these). */
export type Prefill = Partial<
  Pick<RecurringForm, 'name' | 'accountId' | 'categoryId' | 'amount' | 'nextDue'>
>;

export const formFrom = (
  r: Recurring | null,
  today: string,
  prefill: Prefill = {},
): RecurringForm => ({
  name: r?.name ?? '',
  service: r?.service ?? null,
  accountId: r?.accountId ?? null,
  envelopeId: r?.envelopeId ?? null,
  categoryId: r?.categoryId ?? null,
  amount: r?.amount ?? null,
  varies: r ? r.amount === null : false,
  everyMonths: toEvery(r?.everyMonths ?? 1),
  nextDue: r?.nextDue ?? today,
  endsOn: r?.endsOn ?? '',
  ...prefill,
});

/** What stops saving, in the words the Save button shows; null when it can be saved. */
export function validate(f: RecurringForm): string | null {
  if (!f.name.trim()) return 'Give it a name';
  if (!f.accountId) return 'Pick where it is paid from';
  if (!f.categoryId) return 'Pick a category';
  if (!f.varies && !f.amount) return 'Enter the amount';
  if (f.endsOn && f.endsOn < f.nextDue) return 'It ends before it is next due';
  return null;
}

/** The body for a new bill or an edit; call only once `validate` passes. */
export const toRequest = (f: RecurringForm): SaveBody => ({
  name: f.name.trim(),
  service: f.service,
  accountId: f.accountId!,
  envelopeId: f.envelopeId,
  categoryId: f.categoryId!,
  amount: f.varies ? null : f.amount,
  everyMonths: f.everyMonths,
  nextDue: f.nextDue,
  endsOn: f.endsOn || null,
});

// ---- How bills read on screen ----

/** "Due today", "Due tomorrow", "Due in 5 days", "3 days late". */
export function dueWords(due: string, today: string): string {
  const days = daysBetween(today, due);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return days > 0 ? `Due in ${days} days` : `${-days} day${days === -1 ? '' : 's'} late`;
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
