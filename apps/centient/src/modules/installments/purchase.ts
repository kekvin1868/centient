// A purchase paid in installments from the receipt ("Pay in" 3× / 12× / Other on a card or pay later): the
// expense is the whole price on the card, and its plan is written in the same batch, tied to it by
// purchase_entry_id. Editing the entry rewrites the plan in place; switching it to a bank or back to Full ends the
// plan; deleting the entry ends it too (a plan whose purchase is deleted is not listed).
import type { Repos } from '../../middleware/init';
import type { Snapshot } from '../../lib/catalog';
import type { Command } from '../../lib/schemas';
import { firstBillFor } from '../../domain/cardBill';
import { DomainError } from '../../domain/ledger';
import { isCard } from '../../domain/recurring';
import { dueOf } from './service';

type Expense = Extract<Command, { type: 'EXPENSE' }>;

/** The plan rows a purchase on installments asks for; checked like a plan added on Money. */
function rowsOf(c: Snapshot, cmd: Expense, id: string, at: string) {
  const plan = cmd.installments!;
  const account = c.account(cmd.accountId).row;
  if (!isCard(account.kind))
    throw new DomainError(
      'NOT_INSTALLMENT_ACCOUNT',
      'Installments go on a pay later or credit card',
    );
  if (!account.statement_day)
    throw new DomainError('CARD_SETUP', `Set ${account.name}'s limit and bill days first`);
  if (cmd.split || cmd.pot)
    throw new DomainError('PLAN_SPLIT', 'Split a plan with friends from Money for now');
  if (plan.each * plan.count < cmd.amount)
    throw new DomainError('PLAN_PRICE', 'Each month times the count is less than the price');
  if (plan.paid >= plan.count)
    throw new DomainError('PAID_COUNT', 'At least one installment must still be unpaid');
  const days = { closes: account.statement_day, payBy: account.due_day };
  // Slice 1 rides the bill the purchase falls in; the ones already gone (logged late) are not on any bill.
  const firstBill = firstBillFor(cmd.date, days.closes, 0);
  return {
    plan: {
      id,
      account_id: account.id,
      name: cmd.merchant?.trim() || c.categories.find(x => x.id === cmd.categoryId)?.name || 'Plan',
      amount_per_installment: plan.each,
      installments: plan.count,
      first_due: dueOf(firstBill, plan.paid + 1, days) ?? cmd.date,
      anchor_no: plan.paid + 1,
      price: cmd.amount,
      bought_on: cmd.date,
      first_bill: firstBill,
      paid_before: plan.paid,
    },
    prepaid: Array.from({ length: plan.paid }, (_, k) => ({
      plan_id: id,
      installment_no: k + 1,
      party_seq: 0,
      paid_at: at,
      entry_id: null,
    })),
  };
}

const onPlan = (cmd: Command): cmd is Expense => cmd.type === 'EXPENSE' && !!cmd.installments;

/** The writes for new purchases' plans, batched with the entries (`ids` = each command's entry id). */
export function newPlanStatements(
  repos: Repos,
  ws: string,
  c: Snapshot,
  cmds: Command[],
  ids: string[],
) {
  const at = new Date().toISOString();
  return cmds.flatMap((cmd, i) => {
    if (!onPlan(cmd)) return [];
    const { plan, prepaid } = rowsOf(c, cmd, crypto.randomUUID(), at);
    return repos.installments.planInserts(
      ws,
      { ...plan, purchase_entry_id: ids[i] },
      [
        {
          plan_id: plan.id,
          seq: 0,
          name: 'You',
          iou_account_id: null,
          share: plan.amount_per_installment,
        },
      ],
      prepaid,
    );
  });
}

/** The writes that bring an edited purchase's plan in line: rewritten, made, or ended. */
export async function editedPlanStatements(
  repos: Repos,
  ws: string,
  c: Snapshot,
  cmd: Command,
  entryId: string,
) {
  const had = await repos.installments.ofPurchase(ws, entryId);
  if (!onPlan(cmd)) return had ? [repos.installments.planDelete(ws, had.id)] : [];
  if (!had) return newPlanStatements(repos, ws, c, [cmd], [entryId]);
  const { plan, prepaid } = rowsOf(c, cmd, had.id, new Date().toISOString());
  return repos.installments.purchaseUpdates(ws, plan, prepaid);
}
