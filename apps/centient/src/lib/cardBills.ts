// Every set-up card's bills (src/domain/cardBill.ts), read once: the card days, every plan, posted and hand-typed
// interest. The installments service (each slice's progress) and the recurring service (the card statement, "Log
// interest") both read it, so it lives here and neither module imports the other.
import { cardBills, interestSources, type BillPlan } from '../domain/cardBill';
import { hasBills } from '../domain/recurring';
import type { Repos } from '../middleware/init';
import type { Account } from '../repos/accounts';
import type { PlanRow } from '../repos/installments';

/** A plan as the bill math sees it. */
export const billPlan = (p: PlanRow): BillPlan => ({
  id: p.id,
  name: p.name,
  count: p.installments,
  each: p.amount_per_installment,
  price: p.price,
  boughtOn: p.bought_on,
  firstBill: p.first_bill,
  paidBefore: p.paid_before,
});

/**
 * Every set-up card's bills by `today`, by account id, each with where hand-typed interest may come from; and
 * every plan with its parties and payments (callers reuse them instead of reading them again).
 */
export async function loadCardBills(repos: Repos, ws: string, accounts: Account[], today: string) {
  const [days, plans, posted, typed] = await Promise.all([
    repos.recurring.cardDays(ws),
    repos.installments.listPlans(ws),
    repos.installments.interest(ws),
    repos.installments.handInterest(ws),
  ]);
  const interest = [
    ...posted.flatMap(i =>
      i.account_id !== null && i.day !== null && i.amount !== null
        ? [{ ...i, account_id: i.account_id, day: i.day, amount: i.amount, from_month: null }]
        : [],
    ),
    ...typed.map(i => ({ ...i, slice_no: null })),
  ];
  const bills = new Map(
    accounts
      .filter(a => hasBills(a) && !a.archived_at)
      .map(a => {
        const own = plans.plans.filter(p => p.account_id === a.id).map(billPlan);
        const r = cardBills(
          { closes: a.statement_day!, payBy: a.due_day },
          days.filter(d => d.account_id === a.id),
          own,
          interest
            .filter(i => i.account_id === a.id)
            .map(i => ({
              entryId: i.entry_id,
              planId: i.plan_id,
              no: i.slice_no,
              from: i.from_month,
              day: i.day,
              amount: i.amount,
            })),
          today,
        );
        return [a.id, { ...r, interestFrom: interestSources(r, own) }];
      }),
  );
  return { bills, plans };
}
