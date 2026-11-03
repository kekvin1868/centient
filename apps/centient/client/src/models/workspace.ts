// The basics every screen reads: who you are (workspace, today, the cycle, currency decimals), the catalog
// (accounts, pockets, categories) and quick-add's context. They live in the query cache (kept on the device) and
// are mirrored into the `me` / `catalog` / `qctx` signals that screens read, so a reopened app renders from the
// device at once and refreshes behind it.
import type { QAContext } from '@centient/quickadd';
import { queryOptions } from '@tanstack/react-query';
import { catalog, me, qctx, selectedAccount, version } from '../lib/state';
import { call, client, type Res } from './api';
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

/** After a save outside the query layer: every screen reloads (the version bump marks every query stale). */
export async function refresh() {
  version.value++;
  await loadBasics();
}
