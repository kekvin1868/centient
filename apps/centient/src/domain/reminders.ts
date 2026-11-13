// Bill reminders: which notifications a workspace's bills call for on a given day. Pure.
import { DECIMALS } from '@centient/money';

/** How many days ahead the first reminder goes out; the second is on the day. */
export const REMIND_DAYS_AHEAD = 3;

export type Note = { title: string; body: string; tag: string };
type Bill = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  nextDue: string;
  paused: boolean;
};
type Card = {
  accountId: string;
  name: string;
  currency: string;
  dueOn: string | null;
  left: number;
};

// ponytail: the screen's formatter lives in the client (lib/format.ts) and leans on the browser's locale
// data; this is its server twin for the two shapes a notification needs. Share one if a third place asks.
export function money(minor: number, currency: string): string {
  const decimals = DECIMALS[currency] ?? 0;
  if (currency !== 'IDR') return `${currency} ${(minor / 10 ** decimals).toFixed(decimals)}`;
  return `Rp${String(minor).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/**
 * The reminders for `today`: every bill (not paused) and every card bill with money left that is due today or
 * in three days. The tag names the bill and its due date, so a reminder sent twice replaces itself on the phone.
 */
export function dueNotes(bills: Bill[], cards: Card[], today: string, soon: string): Note[] {
  const when = (due: string) =>
    due === today ? 'is due today' : `is due in ${REMIND_DAYS_AHEAD} days`;
  const due = (day: string | null): day is string => day === today || day === soon;
  return [
    ...bills
      .filter(b => !b.paused && due(b.nextDue))
      .map(b => ({
        title: `${b.name} ${when(b.nextDue)}`,
        body: b.amount === null ? 'The amount varies' : money(b.amount, b.currency),
        tag: `bill:${b.id}:${b.nextDue}`,
      })),
    ...cards.flatMap(c =>
      c.left > 0 && due(c.dueOn)
        ? [
            {
              title: `${c.name} bill ${when(c.dueOn)}`,
              body: `${money(c.left, c.currency)} left to pay`,
              tag: `card:${c.accountId}:${c.dueOn}`,
            },
          ]
        : [],
    ),
  ];
}
