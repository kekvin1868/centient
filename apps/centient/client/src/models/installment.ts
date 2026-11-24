// Pay later / credit card installment plans: the plans with their schedule and each person's payments.
import { queryOptions } from '@tanstack/react-query';
import { sliceBill } from '../../../src/domain/cardBill';
import { call, client, type Req, type Res } from './api';
import { billMonth } from './dates';

export type Plan = Res<typeof client.api.installments.$get>['plans'][number];
type NewPlan = Req<typeof client.api.installments.$post>['json'];
type Payment = { id: string; no: number; seq: number };
const plan = client.api.installments[':id'];
const slot = (p: Payment) => ({ id: p.id, no: String(p.no), seq: String(p.seq) });

export const installmentQueries = {
  all: () => ['installments'] as const,
  /** Every account's plans, or one account's. */
  list: (accountId?: string) =>
    queryOptions({
      queryKey: [...installmentQueries.all(), 'list', accountId ?? 'all'],
      queryFn: async () =>
        (
          await call(
            client.api.installments.$get({ query: accountId ? { account: accountId } : {} }),
          )
        ).plans,
    }),
};

/** Plan saves; each refreshes everything (a payment is an entry). */
export const installmentApi = {
  create: (json: NewPlan) => call(client.api.installments.$post({ json })),
  /** "Move to next bill": every installment moves one card bill on. */
  nextBill: (id: string) => call(plan['next-bill'].$post({ param: { id } })),
  /** What the move would take back first (posted interest), for its confirm sheet. Nothing is changed. */
  nextBillPreview: (id: string) => call(plan['next-bill'].$get({ param: { id } })),
  remove: (id: string) => call(plan.$delete({ param: { id } })),
  /** Marks another person's share paid (from their tab); your own share is paid with the card bill. */
  pay: (p: Payment) =>
    call(plan.payments.$post({ param: { id: p.id }, json: { no: p.no, seq: p.seq } })),
  unpay: (p: Payment) => call(plan.payments[':no'][':seq'].$delete({ param: slot(p) })),
  attachProof: (p: Payment, file: File) =>
    call(plan.payments[':no'][':seq'].proof.$post({ param: slot(p), form: { file } })),
  removeProof: (p: Payment) => call(plan.payments[':no'][':seq'].proof.$delete({ param: slot(p) })),
};

/**
 * What "Move to next bill" does, for its confirm sheet: every installment rides one bill later, and interest
 * already posted for a bill that now comes later is taken off until that bill closes (the daily job adds it back).
 */
export function moveWords(
  plan: Pick<Plan, 'firstBill' | 'installments'>,
  interest: { no: number; amount: number }[],
  money: (n: number) => string,
) {
  const on = (no: number) => billMonth(sliceBill(plan, no));
  const last = plan.installments;
  const moves =
    last === 1
      ? `It moves from the ${on(1)} bill to the ${on(2)} bill.`
      : `Installment 1 moves from the ${on(1)} bill to the ${on(2)} bill, and so on up to installment ${last}: ${on(last)} to ${on(last + 1)}.`;
  const taken = interest.length
    ? ` Interest already logged (${interest.map(i => `${money(i.amount)} on installment ${i.no}`).join(', ')}) comes off for now and is added again when its new bill closes.`
    : '';
  return `Every installment moves one bill later. ${moves}${taken} Only do this if the bank started the plan a bill later.`;
}
