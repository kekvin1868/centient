// Entries (what the user logged): the lists on Home and in All activity, 20 or 50 at a time with Load more.
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { Command } from '../../../src/lib/schemas';
import { call, client, type Req, type Res } from './api';
import { outbox, type Learn, type SavedEntry } from './outbox';
import { checkEntry } from './useWaiting';

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

/** A bill with Paid backs tied: the money never came (shrink them) or you got it (owe it back). */
export type PaybackMode = 'NEVER_RECEIVED' | 'RETURN';
/** One person on a split bill, as the list sends it. */
export type BillPerson = NonNullable<EntryItem['people']>[number];

type Record_ = Req<typeof client.api.transactions.$post>['json'];
type IconBody = Req<(typeof client.api.entries)[':id']['icon']['$patch']>['json'];

/**
 * Entry saves. `log`, `edit` and `remove` go through the outbox (models/outbox): the change shows at once and is
 * sent when it can be, so they work with no signal. They resolve as soon as the change is queued; a refusal the
 * phone can see coming (a share of zero, a pocket of another account) is thrown before that.
 */
export const entryApi = {
  /** One new entry; resolves with the id it will have. */
  async log(command: Command, learn?: Learn) {
    await checkEntry(command);
    return outbox.create(command, learn);
  },
  /** Several new entries: all are checked first, then all are queued, so a refusal never leaves half of them. */
  async logAll(list: { command: Command; learn?: Learn }[]) {
    for (const x of list) await checkEntry(x.command);
    return list.map(x => outbox.create(x.command, x.learn));
  },
  /** Several entries written atomically, straight to the server (the first run, the Inbox): needs signal. */
  record: (json: Record_) => call(client.api.transactions.$post({ json })),
  /** `entry`: the entry as the screen shows it. `paybacks`: what to do with Paid backs a shrunk bill has no room for. */
  async edit(entry: SavedEntry, command: Command, paybacks?: PaybackMode) {
    await checkEntry(command);
    outbox.edit(entry, command, paybacks);
  },
  remove: (entry: SavedEntry, paybacks?: PaybackMode) => outbox.remove(entry, paybacks),
  setIcon: (id: string, json: IconBody) =>
    call(client.api.entries[':id'].icon.$patch({ param: { id }, json })),
};
