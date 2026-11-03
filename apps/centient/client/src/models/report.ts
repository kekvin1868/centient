// Reports: Insights for one period (a cycle or a year) and one currency.
import { queryOptions } from '@tanstack/react-query';
import { OfflineError } from '../lib/api';
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

type CsvQuery = NonNullable<Req<(typeof client.api)['export.csv']['$get']>['query']>;

/** The CSV export for a period (and a currency), as text: a file to hand over, never cached. */
export async function exportCsv(query: CsvQuery): Promise<string> {
  let res: { ok: boolean; text(): Promise<string>; json(): Promise<unknown> };
  try {
    res = await client.api['export.csv'].$get({ query });
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Something went wrong');
  }
  return res.text();
}

/** Everything in the workspace as one document (Settings' backup download). */
export const backup = () => call(client.api.backup.$get());
