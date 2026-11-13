// A list of entries for a filter, a page at a time (models/entry), with the entries still waiting to be sent laid
// over it (models/useWaiting). The pages are kept with the query cache, so coming back to a list shows it at once
// while it refreshes.
import { useInfiniteQuery } from '@tanstack/react-query';
import { entryQueries, type EntryFilter } from '../../models/entry';
import { mergeEntries, waiting } from '../../models/useWaiting';
import type { Entry } from './EntryList';

export function useEntries(filter: EntryFilter, limit: number, enabled = true) {
  const q = useInfiniteQuery({ ...entryQueries.list(filter, limit), enabled });
  const items: Entry[] = mergeEntries(
    q.data?.pages.flatMap(p => p.items) ?? [],
    waiting.value,
    filter,
  );
  return {
    items,
    more: q.hasNextPage,
    loaded: q.data !== undefined,
    loadMore: () => void q.fetchNextPage(),
  };
}
