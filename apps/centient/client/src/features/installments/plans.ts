// Installment plans (credit cards and pay later, `isCard`): loading them. What is due is the card's bill.
import { useQuery } from '@tanstack/react-query';
import { installmentQueries } from '../../models/installment';

/** Plans of every account, or of one account; null while loading. */
export function usePlans(accountId?: string) {
  return useQuery(installmentQueries.list(accountId)).data ?? null;
}
