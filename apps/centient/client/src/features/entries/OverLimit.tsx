// Over the limit: a spend on a card or pay later that is more than what is left of its limit (a plan counts its
// whole price). The receipt says so live under PAID WITH; saving opens OVER THE LIMIT instead, with no "Save
// anyway". The spend is logged after buying, so the bank let it through: either the app's limit is old (MY LIMIT
// WENT UP: set it, then log) or it went on another account (PAID WITH ANOTHER: the ones that cover it first, the
// rest Not enough). Go back leaves everything as it was. Checked against the balances on the phone (waiting
// changes counted), so it works offline too. The check and the line; the save wrapper is ./limitGate.
import { formatMoney } from '../../lib/format';
import { catalog } from '../../lib/state';
import { limitOf } from '../../models/account';
import type { Form } from './form';

type Balance = { id: string; balance: number };
/** The entry as it was before this edit: its money is already in the account's balance. */
export type Before = { accountId: string | null; amount: number | null };

/** How a spend stands against its card's limit; null when it fits (or the account has no limit). */
export function shortOf(f: Form, balances: Balance[] | undefined, before?: Before) {
  if (f.type !== 'EXPENSE' || !f.amount || !f.accountId || !balances) return null;
  const row = catalog.value.accounts.find(a => a.id === f.accountId);
  const bal = balances.find(b => b.id === f.accountId);
  if (!row || !bal) return null;
  const limit = limitOf(row);
  if (!limit) return null;
  const back = before?.accountId === f.accountId ? (before.amount ?? 0) : 0;
  const left = Math.max(0, limit + bal.balance + back);
  return f.amount > left
    ? {
        name: row.name,
        limit,
        left,
        spend: f.amount,
        short: f.amount - left,
        currency: row.currency_code,
      }
    : null;
}
export type Short = NonNullable<ReturnType<typeof shortOf>>;

/** The live line under PAID WITH. */
export function OverLimitLine({ short }: { short: Short }) {
  return (
    <p className="pb-1 text-[13px] font-bold text-[#c2185b]" role="status">
      Only {formatMoney(short.left, short.currency)} left on this card
    </p>
  );
}
