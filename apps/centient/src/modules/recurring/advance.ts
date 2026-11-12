// Moving a recurring bill on once it is paid. The ledger (a saved expense that pays a bill) and the recurring
// service (Mark paid) both use this, so they write the same thing.
import { dueAfter, pays, type Schedule } from '../../domain/recurring';
import type { Command } from '../../lib/schemas';
import type { Repos } from '../../middleware/init';
import type { Recurring } from '../../repos/recurring';

export const scheduleOf = (r: Recurring): Schedule => ({
  nextDue: r.next_due,
  dueDay: r.due_day,
  everyMonths: r.every_months,
  endsOn: r.ends_on,
});

/** The write that moves a paid bill to its next due date, or closes it when that was its last one. */
export function advance(repos: Repos, ws: string, r: Recurring, at: string): D1PreparedStatement {
  const next = dueAfter(scheduleOf(r));
  // The patch is never empty, so there is always a statement.
  return repos.recurring.updateStatement(
    ws,
    r.id,
    next ? { next_due: next } : { archived_at: at },
  )!;
}

/** The bills (not paused) these commands pay; a bill counts once even when two expenses match it. */
export function paidBy(rows: Recurring[], cmds: Command[]): Recurring[] {
  const expenses = cmds.filter(c => c.type === 'EXPENSE');
  return rows.filter(
    r =>
      !r.paused_at &&
      expenses.some(e =>
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
      ),
  );
}
