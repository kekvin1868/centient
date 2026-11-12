// Money between you and a person's tab (an IOU account: above zero they owe you, below zero you owe them).
// Paid back moves money out of the tab into your account; Return money the other way. Extra money they handed over
// stays on the tab as what you owe them, unless it's a gift: an income on the tab, kept in the Paid back's own entry
// (deleting the Paid back deletes it). A Paid back names the split bills it pays (`bills`, see models/bills).
import type { Command } from '../../../src/lib/schemas';

export type PayMode = 'PAID' | 'RETURN';

/** How much of `amount` is more than the tab owed. `owed` may be below zero already. */
export const extraOf = (amount: number | null, owed: number) =>
  Math.max(0, (amount ?? 0) - Math.max(0, owed));

/** The move itself: Paid back is tab -> account, Return money is account -> tab. */
export function moveCommand(
  mode: PayMode,
  i: {
    tabId: string;
    accountId: string;
    pocket: string | null;
    amount: number;
    date: string;
    /** Paid back: the part of `amount` above what was owed that is a gift (saved in the same entry). */
    gift?: number;
    /** Paid back: how much pays which split bill. */
    bills?: { entryId: string; amount: number }[];
  },
): Command {
  const mine = i.pocket ?? undefined;
  return mode === 'PAID'
    ? {
        type: 'TRANSFER',
        fromAccountId: i.tabId,
        toAccountId: i.accountId,
        toEnvelopeId: mine,
        amount: i.amount,
        gift: i.gift || undefined,
        bills: i.bills?.length ? i.bills : undefined,
        date: i.date,
      }
    : {
        type: 'TRANSFER',
        fromAccountId: i.accountId,
        fromEnvelopeId: mine,
        toAccountId: i.tabId,
        amount: i.amount,
        date: i.date,
      };
}
