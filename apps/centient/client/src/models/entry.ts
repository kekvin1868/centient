// Entries (what the user logged): the lists on Home and in All activity, 20 or 50 at a time with Load more.
// (Saving and editing entries move here in their own step.)
import { infiniteQueryOptions } from '@tanstack/react-query';
import { call, client, type Res } from './api';

export type EntryPage = Res<typeof client.api.entries.$get>;
export type EntryItem = EntryPage['items'][number];
/** Which entries a list shows; empty values mean "any". */
export type EntryFilter = { account?: string | null; type?: string; from?: string; to?: string };

const TYPES = ['INCOME', 'EXPENSE', 'TRANSFER', 'ALLOCATE'] as const;

export const entryQueries = {
  all: () => ['entries'] as const,
  list: (f: EntryFilter, limit: number) =>
    infiniteQueryOptions({
      queryKey: [...entryQueries.all(), 'list', f, limit],
      queryFn: ({ pageParam }) =>
        call(
          client.api.entries.$get({
            query: {
              limit: String(limit),
              account: f.account || undefined,
              type: TYPES.find(t => t === f.type),
              from: f.from || undefined,
              to: f.to || undefined,
              cursor: pageParam ?? undefined,
            },
          }),
        ),
      // The first page has no cursor. Kept on the device as JSON, it comes back as null, so null means none too.
      initialPageParam: null as string | null,
      getNextPageParam: last => last.nextCursor,
    }),
};
