// Crypto prices in rupiah, for showing what a BTC / USDT balance is worth. The server refreshes them every 10
// minutes and serves the last known one when the price service is down; the last answer is also kept on the
// device without a time limit, so values still show (marked with their time) when there is no connection.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { load, save } from '../lib/storage';
import { call, client, type Res } from './api';

export type Prices = Res<typeof client.api.prices.$get>;

export const priceQueries = {
  rupiah: () =>
    queryOptions({
      queryKey: ['prices', 'rupiah'],
      queryFn: async () => {
        const p = await call(client.api.prices.$get());
        save('prices', p);
        return p;
      },
      staleTime: 10 * 60_000,
    }),
};

/** The latest prices, else the last ones this device saw (possibly old: show their time). */
export const usePrices = (): Prices =>
  useQuery(priceQueries.rupiah()).data ?? load<Prices>('prices', {});
