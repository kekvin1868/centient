// One saved bill for the recurring tests; pass what differs.
import type { Recurring } from './recurring';

export const bill = (o: Partial<Recurring> = {}): Recurring => ({
  id: 'r1',
  name: 'Netflix',
  accountId: 'bca',
  envelopeId: null,
  categoryId: 'fun',
  currency: 'IDR',
  amount: 120_000,
  everyMonths: 1,
  nextDue: '2026-11-20',
  endsOn: null,
  service: 'netflix',
  paused: false,
  dues: ['2026-11-20', '2026-12-20'],
  ...o,
});
