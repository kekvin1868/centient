// Installment plans: which accounts take them, loading them, and which are due soon.
import { useQuery } from '@tanstack/react-query';
import { installmentQueries, type Plan } from '../../models/installment';

export const takesInstallments = (kind: string) => kind === 'PAYLATER' || kind === 'CREDIT_CARD';

/** Plans of every account (for Home's "due soon"), or of one account; null while loading. */
export function usePlans(accountId?: string) {
  return useQuery(installmentQueries.list(accountId)).data ?? null;
}

/** The plans with something due within 3 days (or overdue), soonest first. */
export function dueSoon(plans: Plan[], today: string) {
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
  return plans
    .filter(p => p.next && p.next.due <= soon)
    .sort((a, b) => a.next!.due.localeCompare(b.next!.due));
}
