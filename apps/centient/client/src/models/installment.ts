// Pay later / credit card installment plans: the plans with their schedule and each person's payments.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';

export type Plan = Res<typeof client.api.installments.$get>['plans'][number];
type NewPlan = Req<typeof client.api.installments.$post>['json'];
type Payment = { id: string; no: number; seq: number };
const plan = client.api.installments[':id'];
const slot = (p: Payment) => ({ id: p.id, no: String(p.no), seq: String(p.seq) });

export const installmentQueries = {
  all: () => ['installments'] as const,
  /** Every account's plans (Home's "due soon"), or one account's. */
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
  remove: (id: string) => call(plan.$delete({ param: { id } })),
  /** Marks a share paid; your own share (seq 0) is paid from `fromAccountId`. */
  pay: (p: Payment, fromAccountId?: string) =>
    call(
      plan.payments.$post({ param: { id: p.id }, json: { no: p.no, seq: p.seq, fromAccountId } }),
    ),
  unpay: (p: Payment) => call(plan.payments[':no'][':seq'].$delete({ param: slot(p) })),
  attachProof: (p: Payment, file: File) =>
    call(plan.payments[':no'][':seq'].proof.$post({ param: slot(p), form: { file } })),
  removeProof: (p: Payment) => call(plan.payments[':no'][':seq'].proof.$delete({ param: slot(p) })),
};
