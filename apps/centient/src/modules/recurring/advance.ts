// Moving a recurring bill on once it is paid, and back when the entry that paid it is deleted. The ledger (a saved
// expense that pays a bill), the recurring service (Mark paid) and the Inbox (undo an import) all use this, so they
// write the same thing.
import { dueAfter, pays, type Schedule } from '../../domain/recurring';
import { paidTicket } from '../../domain/tickets';
import type { Command } from '../../lib/schemas';
import type { Repos } from '../../middleware/init';
import type { Recurring } from '../../repos/recurring';

export const scheduleOf = (r: Recurring): Schedule => ({
  nextDue: r.next_due,
  dueDay: r.due_day,
  everyMonths: r.every_months,
  endsOn: r.ends_on,
});

/**
 * The writes for a bill paid by `entryId`: its due date is tied to that entry, and the bill moves to its next due
 * date, or closes when that was its last one.
 */
export function advance(
  repos: Repos,
  ws: string,
  r: Recurring,
  entryId: string,
  at: string,
): D1PreparedStatement[] {
  const next = dueAfter(scheduleOf(r));
  return [
    repos.recurring.payStatement(ws, r.id, r.next_due, entryId),
    // The patch is never empty, so there is always a statement.
    repos.recurring.updateStatement(ws, r.id, next ? { next_due: next } : { archived_at: at })!,
  ];
}

/**
 * The writes that put bills back to unpaid when these entries go: a bill moves back to the due date an entry paid,
 * but only when that was its latest payment (its next due date is still the one after it). Several entries of one
 * bill walk it back together. The Mark paid tickets of those due dates are forgotten, so they can be paid again.
 * ponytail: a bill closed by its last payment stays closed, and one whose dates were changed by hand stays put.
 */
export async function unpay(
  repos: Repos,
  ws: string,
  entryIds: string[],
): Promise<D1PreparedStatement[]> {
  const paid = await repos.recurring.paidBy(ws, entryIds);
  if (!paid.length) return [];
  const stmts: D1PreparedStatement[] = [
    repos.tickets.forgetStatement(
      ws,
      paid.map(p => paidTicket(p.recurring_id, p.due)),
    ),
  ];
  for (const r of await repos.recurring.list(ws)) {
    const dues = paid
      .filter(p => p.recurring_id === r.id)
      .map(p => p.due)
      .sort()
      .reverse();
    let next = r.next_due;
    for (const due of dues) {
      if (dueAfter({ ...scheduleOf(r), nextDue: due }) !== next) break;
      next = due;
    }
    if (next !== r.next_due)
      stmts.push(repos.recurring.updateStatement(ws, r.id, { next_due: next })!);
  }
  return stmts;
}

/**
 * The bills (not paused) these commands pay, each with the index of the first command that pays it; a bill counts
 * once even when two expenses match it.
 */
export function paidBy(rows: Recurring[], cmds: Command[]): { bill: Recurring; index: number }[] {
  return rows.flatMap(r => {
    if (r.paused_at) return [];
    const index = cmds.findIndex(
      e =>
        e.type === 'EXPENSE' &&
        pays(
          {
            accountId: r.account_id,
            amount: r.amount,
            name: r.name,
            service: r.service,
            nextDue: r.next_due,
          },
          e,
        ),
    );
    return index < 0 ? [] : [{ bill: r, index }];
  });
}
