// Accounts and pockets with their balances. (More of this domain moves here in its own step.)
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Res } from './api';

/** Every account and pocket with its balance, in its own currency. */
export type Balances = Res<typeof client.api.balances.$get>;

export const accountQueries = {
  all: () => ['accounts'] as const,
  balances: () =>
    queryOptions({
      queryKey: [...accountQueries.all(), 'balances'],
      queryFn: () => call(client.api.balances.$get()),
    }),
};
