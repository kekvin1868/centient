// Entries (what the user logged): the lists on Home and in All activity, 20 or 50 at a time with Load more.
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';

export type EntryPage = Res<typeof client.api.entries.$get>;
export type EntryItem = EntryPage['items'][number];
/** Which entries a list shows; empty values mean "any". */
export type EntryFilter = { account?: string | null; type?: string; from?: string; to?: string };

const TYPES = ['INCOME', 'EXPENSE', 'TRANSFER', 'ALLOCATE'] as const;
type ListQuery = NonNullable<Req<typeof client.api.entries.$get>['query']>;
/** Every filter the server takes, without paging (Insights' rows: a category or a merchant in a period). */
export type EntryMatch = Omit<ListQuery, 'cursor' | 'limit'>;

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
  /** Every entry matching, all pages at once (so a total below the list is the row's total). */
  matching: (f: EntryMatch) =>
    queryOptions({
      queryKey: [...entryQueries.all(), 'matching', f],
      queryFn: async () => {
        const items: EntryItem[] = [];
        let cursor: string | undefined;
        do {
          const page = await call(
            client.api.entries.$get({ query: { ...f, limit: '200', cursor } }),
          );
          items.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return items;
      },
    }),
};

type Record_ = Req<typeof client.api.transactions.$post>['json'];
type EditBody = Req<(typeof client.api.entries)[':id']['$patch']>['json'];
type IconBody = Req<(typeof client.api.entries)[':id']['icon']['$patch']>['json'];
type QuickSave = Req<typeof client.api.quickadd.save.$post>['json'];

/** Entry saves. Each refreshes everything: an entry moves balances, budgets, Insights and its lists. */
export const entryApi = {
  /** One command or `{ commands }` written atomically (a move between pockets is an ALLOCATE). */
  record: (json: Record_) => call(client.api.transactions.$post({ json })),
  edit: (id: string, json: EditBody) =>
    call(client.api.entries[':id'].$patch({ param: { id }, json })),
  remove: (id: string) => call(client.api.entries[':id'].$delete({ param: { id } })),
  setIcon: (id: string, json: IconBody) =>
    call(client.api.entries[':id'].icon.$patch({ param: { id }, json })),
  /** Quick-add's drafts, with what was learned from them. */
  quickSave: (json: QuickSave) => call(client.api.quickadd.save.$post({ json })),
};
