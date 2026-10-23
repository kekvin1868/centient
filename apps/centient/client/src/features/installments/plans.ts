// Installment plans: which accounts take them, loading them, and which are due soon.
import { useEffect, useState } from 'react';
import type { PlanView } from '../../../../src/modules/installments/service';
import { call, client } from '../../lib/api';
import { attempt } from '../../lib/run';
import { version } from '../../lib/state';

export const takesInstallments = (kind: string) => kind === 'PAYLATER' || kind === 'CREDIT_CARD';

/** Plans of every account (for Home's "due soon"), or of one account. Reloads after every write. */
export function usePlans(accountId?: string) {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  useEffect(() => {
    attempt(async () => setPlans((await call(client.api.installments.$get({ query: accountId ? { account: accountId } : {} }))).plans as PlanView[]));
  }, [accountId, version.value]);
  return plans;
}

/** The plans with something due within 3 days (or overdue), soonest first. */
export function dueSoon(plans: PlanView[], today: string) {
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
  return plans.filter(p => p.next && p.next.due <= soon).sort((a, b) => a.next!.due.localeCompare(b.next!.due));
}
