// The data layer (TanStack Query, following TkDodo's patterns): one QueryClient for the app.
// - Every domain in models/ defines its queries with `queryOptions` (key + fetch together, keys from general to
//   specific) and its saves with `useMutation({ meta: { invalidates: [...] } })`.
// - After any successful save, the queries it names are marked stale (every query when it names none); only the
//   ones on screen refetch.
// - Failures show as a toast, unless the save handles its own (`onError`).
// - The cache is kept on the device, so a reopened app paints from its last data and refreshes behind it.
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import {
  matchQuery,
  MutationCache,
  MutationObserver,
  QueryCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { errorText } from '../lib/run';
import { showToast } from '../ui/Toast';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { invalidates?: QueryKey[] };
  }
}

const DAY = 24 * 3600_000;

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    // Only this app changes the data and every save invalidates, so a minute of freshness saves refetches on
    // tab switches; reopening the app after that refreshes what's on screen.
    queries: { staleTime: 60_000, gcTime: DAY, retry: 2 },
  },
  queryCache: new QueryCache({
    // A failed refresh of data already on screen: say so, the screen keeps the last data.
    onError: (e, query) => {
      if (query.state.data !== undefined) showToast(errorText(e));
    },
  }),
  mutationCache: new MutationCache({
    onError: (e, _v, _c, mutation) => {
      if (!mutation.options.onError) showToast(errorText(e));
    },
    onSuccess: (_d, _v, _c, mutation) => {
      const keys = mutation.meta?.invalidates;
      return queryClient.invalidateQueries({
        predicate: q => keys?.some(queryKey => matchQuery({ queryKey }, q)) ?? true,
      });
    },
  }),
});

/** localStorage when the device allows it (private mode can refuse); otherwise nothing is kept. */
function storage() {
  try {
    localStorage.setItem('centient:probe', '1');
    localStorage.removeItem('centient:probe');
    return localStorage;
  } catch {
    return undefined;
  }
}

export const persister = createSyncStoragePersister({
  storage: storage(),
  key: 'centient:queries',
});
/** Kept a day; a new build drops it, so a changed response shape never meets old data. */
export const persistOptions = {
  persister,
  maxAge: DAY,
  buster: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
};

/**
 * Runs a save as a tracked mutation, for code that saves once and moves on (a sheet's Save, the first run).
 * A refusal shows as a toast; when it works, the queries it names (every query when it names none) refresh, and
 * it resolves only after that, so the next line sees fresh data. Resolves true when it worked.
 * Screens that show a save's progress use `useMutation` from their model instead.
 */
export function persist(
  fn: () => Promise<unknown>,
  invalidates?: QueryKey[],
  /** Handles a refusal itself (no toast), e.g. quick-add keeping its drafts while offline. */
  onError?: (e: Error) => void,
): Promise<boolean> {
  return new MutationObserver(queryClient, { mutationFn: fn, meta: { invalidates }, onError })
    .mutate()
    .then(
      () => true,
      () => false,
    );
}
