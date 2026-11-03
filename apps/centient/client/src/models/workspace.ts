// The basics every screen reads: who you are (workspace, today, the cycle, currency decimals), the catalog
// (accounts, pockets, categories) and quick-add's context. They live in the query cache (kept on the device) and
// are mirrored into the `me` / `catalog` / `qctx` signals that screens read, so a reopened app renders from the
// device at once and refreshes behind it.
import type { QAContext } from '@centient/quickadd';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { catalog, me, qctx, selectedAccount } from '../lib/state';
import { call, client, type Req, type Res } from './api';
import { queryClient } from './query';

export type Me = Res<typeof client.api.me.$get>;
export type Catalog = Res<typeof client.api.catalog.$get>;
export type Account = Catalog['accounts'][number];
export type Envelope = Catalog['envelopes'][number];
export type Category = Catalog['categories'][number];

export const workspaceQueries = {
  all: () => ['workspace'] as const,
  me: () =>
    queryOptions({
      queryKey: [...workspaceQueries.all(), 'me'],
      queryFn: () => call(client.api.me.$get()),
    }),
  catalog: () =>
    queryOptions({
      queryKey: [...workspaceQueries.all(), 'catalog'],
      queryFn: () => call(client.api.catalog.$get()),
    }),
  quickadd: () =>
    queryOptions({
      queryKey: [...workspaceQueries.all(), 'quickadd'],
      // ponytail: the server's context is the package's QAContext; named here so the parser gets its own type.
      queryFn: (): Promise<QAContext> => call(client.api.quickadd.context.$get()),
    }),
};

function mirror(m: Me, c: Catalog, q: QAContext) {
  me.value = m;
  catalog.value = c;
  qctx.value = q;
  const picked = selectedAccount.value;
  if (picked && !c.accounts.some(a => a.id === picked && !a.archived_at))
    selectedAccount.value = null;
}

/** Fills the signals from the device's saved cache; true when everything was there (the app can render now). */
export function seedBasics(): boolean {
  const m = queryClient.getQueryData(workspaceQueries.me().queryKey);
  const c = queryClient.getQueryData(workspaceQueries.catalog().queryKey);
  const q = queryClient.getQueryData(workspaceQueries.quickadd().queryKey);
  if (!m || !c || !q) return false;
  mirror(m, c, q);
  return true;
}

/** Loads the basics (from the cache while fresh) and mirrors them into the signals. */
export async function loadBasics() {
  const [m, c, q] = await Promise.all([
    queryClient.fetchQuery(workspaceQueries.me()),
    queryClient.fetchQuery(workspaceQueries.catalog()),
    queryClient.fetchQuery(workspaceQueries.quickadd()),
  ]);
  mirror(m, c, q);
}

// Whenever a basic query gets new data (a save's refresh, a refetch on reopen), the signals follow.
queryClient.getQueryCache().subscribe(e => {
  if (e.type === 'updated' && e.action.type === 'success' && e.query.queryKey[0] === 'workspace')
    seedBasics();
});

/** Keeps the basics observed (App), so a save's refresh refetches them and the signals follow. */
export function useBasicsLive(enabled: boolean) {
  useQuery({ ...workspaceQueries.me(), enabled });
  useQuery({ ...workspaceQueries.catalog(), enabled });
  useQuery({ ...workspaceQueries.quickadd(), enabled });
}

type WorkspacePatch = Req<typeof client.api.workspace.$patch>['json'];

/** Workspace saves; each refreshes everything. */
export const workspaceApi = {
  update: (json: WorkspacePatch) => call(client.api.workspace.$patch({ json })),
  reset: () => call(client.api.workspace.reset.$post()),
};
