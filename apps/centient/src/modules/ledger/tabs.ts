// A person's tab: the IOU account that holds what they owe you. One name is one tab, in the bill's currency.
import { DomainError } from '../../domain/ledger';
import type { Repos } from '../../middleware/init';
import type { Account } from '../../repos/accounts';

/**
 * The tab named `name` (ignoring case) in `currency`, made if missing. A name already used in another currency
 * (or by a bank account) gets the code appended: "Andi (USD)". A hidden tab is not reused silently.
 * ponytail: a name taken by something else that is also called "Andi (USD)" fails on the UNIQUE name.
 */
export async function findOrCreateTab(
  repos: Repos,
  ws: string,
  accounts: Account[],
  name: string,
  currency: string,
): Promise<string> {
  const n = name.trim();
  const key = n.toLowerCase();
  const withCode = `${key} (${currency.toLowerCase()})`;
  const mine = accounts.find(
    a =>
      a.kind === 'IOU' &&
      a.currency_code === currency &&
      [key, withCode].includes(a.name.toLowerCase()),
  );
  if (mine) {
    if (mine.archived_at)
      throw new DomainError('TAB_HIDDEN', `${mine.name} is hidden. Show it again first.`);
    return mine.id;
  }
  const taken = accounts.some(a => a.name.toLowerCase() === key);
  return (
    await repos.accounts.create(ws, {
      name: taken ? `${n} (${currency})` : n,
      kind: 'IOU',
      provider: null,
      currency_code: currency,
      due_day: null,
    })
  ).id;
}
