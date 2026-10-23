// A page of entries for a filter, with "load more". With a cache key, the last page shown comes back at once.
import { useState } from 'react';
import { call, client } from '../../lib/api';
import { attempt } from '../../lib/run';
import { type Entry } from './EntryList';

const recentCache = new Map<string, { items: Entry[]; cursor: string | null }>();

export function useEntries(filter: { account?: string | null; type?: string; from?: string; to?: string }, limit: number, cacheKey?: string) {
  const cached = cacheKey ? recentCache.get(cacheKey) : undefined;
  const [items, setItems] = useState<Entry[]>(cached?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(cached?.cursor ?? null);
  const [loaded, setLoaded] = useState(Boolean(cached));
  const load = async (more: boolean) => {
    type EntryType = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'ALLOCATE';
    const query = {
      limit: String(limit), account: filter.account || undefined, type: (filter.type || undefined) as EntryType | undefined,
      from: filter.from || undefined, to: filter.to || undefined, cursor: more && cursor ? cursor : undefined,
    };
    await attempt(async () => {
      const page = await call(client.api.entries.$get({ query }));
      const next = more ? [...items, ...(page.items as Entry[])] : (page.items as Entry[]);
      setItems(next);
      setCursor(page.nextCursor);
      setLoaded(true);
      if (cacheKey && !more) recentCache.set(cacheKey, { items: next, cursor: page.nextCursor });
    });
  };
  return { items, more: cursor !== null, loaded, load };
}
