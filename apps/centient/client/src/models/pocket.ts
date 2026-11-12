// Pockets: a goal's Activity (its movements with the balance after each, 50 a page, and how it stands).
// (Creating, editing and moving money between pockets move here in their own step.)
import { infiniteQueryOptions } from '@tanstack/react-query';
import { call, client, type Req, type Res } from './api';

type ActivityPage = Res<(typeof client.api.envelopes)[':id']['activity']['$get']>;
/** Progress, state and what to put in each cycle (models the server's goalOutlook). */
export type GoalOutlook = ActivityPage['goal'];

export const pocketQueries = {
  all: () => ['pockets'] as const,
  activity: (id: string) =>
    infiniteQueryOptions({
      queryKey: [...pocketQueries.all(), 'activity', id],
      queryFn: ({ pageParam }) =>
        call(
          client.api.envelopes[':id'].activity.$get({
            param: { id },
            query: { cursor: pageParam ?? undefined },
          }),
        ),
      // The first page has no cursor. Kept on the device as JSON, it comes back as null, so null means none too.
      initialPageParam: null as string | null,
      getNextPageParam: last => last.nextCursor,
    }),
};

/** The log's rows: each entry carries this goal's +/- and the balance after, in the goal's currency. */
export const activityRows = (pages: ActivityPage[]) =>
  pages.flatMap(p =>
    p.items.map(e => ({ ...e, pocket: { ...e.pocket, currency: p.goal.currency } })),
  );

type NewPocket = Req<typeof client.api.envelopes.$post>['json'];

/** Pocket saves (moving money between pockets is an entry: entryApi.record). Each refreshes everything. */
export const pocketApi = {
  create: (json: NewPocket) => call(client.api.envelopes.$post({ json })),
  update: (id: string, json: Req<(typeof client.api.envelopes)[':id']['$patch']>['json']) =>
    call(client.api.envelopes[':id'].$patch({ param: { id }, json })),
};

export type PocketKind = NonNullable<NewPocket['kind']>;
const POCKET_KINDS = ['SPENDING', 'SAVINGS', 'GOAL'] as const satisfies readonly PocketKind[];
/** A drafted kind as one the server takes; anything unknown is a spending pocket. */
export const toPocketKind = (k: string): PocketKind =>
  POCKET_KINDS.find(x => x === k) ?? 'SPENDING';
