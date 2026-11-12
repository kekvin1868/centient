// Under a split bill in the log: you first (your part, spent from the bill's account / pocket), then who else is on
// it and how far each one paid back (mini HP bar + chip). Unpaid first, five at most; "See details" opens the bill,
// whose sheet lists everyone (`all`).
import { formatMoney } from '../../lib/format';
import { catalog, nameOf } from '../../lib/state';
import type { Command } from '../../../../src/lib/schemas';
import type { BillPerson } from '../../models/entry';
import { HpBar } from '../../ui/HpBar';
import { KeyChip } from '../../ui/KeyChip';

const SHOWN = 5;

/** Who still owes first (most left first), then who paid. */
export const unpaidFirst = (people: BillPerson[]) =>
  [...people].sort((a, b) => b.share - b.paid - (a.share - a.paid));

/** Your part of a split bill: the bill less everyone else's share, and where it was spent from. */
export function myPart(bill: Command | null, people: BillPerson[]) {
  if (bill?.type !== 'EXPENSE') return null;
  // ponytail: shares only; a share you covered from another account is its own entry and not counted here.
  const amount = bill.amount - people.reduce((s, p) => s + p.share, 0);
  if (amount <= 0) return null;
  // The pocket's name, or the account's when it is the Main pocket (short: the row is narrow).
  const pocket = catalog.value.envelopes.find(e => e.id === bill.envelopeId);
  const where =
    pocket && !catalog.value.accounts.some(a => a.default_envelope_id === pocket.id)
      ? pocket.name
      : nameOf(catalog.value.accounts, bill.accountId);
  return { amount, where };
}

export function BillPeople({
  bill,
  people,
  currency,
  all,
  onMore,
}: {
  /** The bill's own command: gives the "Me" row. */
  bill: Command | null;
  people: BillPerson[];
  currency: string;
  /** Every person, no See details (the bill's own sheet). */
  all?: boolean;
  onMore?: () => void;
}) {
  const sorted = unpaidFirst(people);
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  const more = sorted.length - shown.length;
  const me = myPart(bill, people);
  return (
    <div className={`flex flex-col gap-1.5 ${all ? 'px-4 pb-4' : 'pb-2.5 pl-[68px] pr-4'}`}>
      {me && (
        <div className="flex items-center gap-2 text-[14px]">
          <span aria-hidden="true" className="text-muted">
            └
          </span>
          <span className="min-w-0 flex-1 truncate">
            Me <span className="text-muted">· {me.where}</span>
          </span>
          <HpBar value={me.amount} max={me.amount} />
          <KeyChip state="SPENT" extra={formatMoney(me.amount, currency)} />
        </div>
      )}
      {shown.map(p => {
        const left = p.share - p.paid;
        const name = nameOf(catalog.value.accounts, p.tabId);
        return (
          <div key={p.tabId} className="flex items-center gap-2 text-[14px]">
            <span aria-hidden="true" className="text-muted">
              └
            </span>
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <HpBar value={p.paid} max={p.share} />
            {left > 0 ? (
              <KeyChip state="OWES" extra={formatMoney(left, currency)} />
            ) : (
              <KeyChip state="PAID" />
            )}
          </div>
        );
      })}
      {more > 0 && onMore && (
        <button
          type="button"
          className="keycap keycap-quiet mt-1 h-8 self-start text-[13px]"
          onClick={onMore}
        >
          See details · {more} more
        </button>
      )}
    </div>
  );
}
