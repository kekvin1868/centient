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
 * What "Move to next bill" does, for its confirm box, as a picture: the next installment's bill → the one after
 * (every installment left moves one bill on), and interest already posted that comes off now and is added again
 * when its new bill closes (the daily job). `words` is the same in one line, for screen readers.
 */
export function moveView(
  plan: Pick<Plan, 'firstBill' | 'installments' | 'paidCount' | 'next'>,
  interest: { no: number; amount: number }[],
) {
  const on = (no: number) => billMonth(sliceBill(plan, no)).toUpperCase();
  const no = plan.next?.no ?? 1;
  const left = plan.installments - plan.paidCount;
  const view = {
    from: on(no),
    to: on(no + 1),
    left,
    interest: interest.map(i => ({ amount: i.amount, on: on(i.no + 1) })),
  };
  return {
    ...view,
    words: `${view.from} to ${view.to}: ${left === 1 ? 'the installment left moves' : `all ${left} left move`} one bill on`,
  };
}
