// A list of entries for a filter, a page at a time (models/entry). The pages are kept with the query cache, so
// coming back to a list shows it at once while it refreshes.
import { useInfiniteQuery } from '@tanstack/react-query';
import { entryQueries, type EntryFilter } from '../../models/entry';
import type { Entry } from './EntryList';

export function useEntries(filter: EntryFilter, limit: number, enabled = true) {
  const q = useInfiniteQuery({ ...entryQueries.list(filter, limit), enabled });
  const items: Entry[] = q.data?.pages.flatMap(p => p.items) ?? [];
  return {
    items,
    more: q.hasNextPage,
    loaded: q.data !== undefined,
    loadMore: () => void q.fetchNextPage(),
  };
}
