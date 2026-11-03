// Reports: Insights for one period (a cycle or a year) and one currency.
import { queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';

export type InsightsQuery = NonNullable<Req<typeof client.api.insights.$get>['query']>;
export type Insights = Res<typeof client.api.insights.$get>;

export const reportQueries = {
  all: () => ['reports'] as const,
  insights: (query: InsightsQuery) =>
    queryOptions({
      queryKey: [...reportQueries.all(), 'insights', query],
      queryFn: () => call(client.api.insights.$get({ query })),
    }),
};
