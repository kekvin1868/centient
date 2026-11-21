// A page inside a screen (the app has no router; a screen swaps its own content): `page` is what is open, null
// for the screen itself. Opening starts at the top; going back returns to where the screen was scrolled.
// ponytail: no browser history entry, so a phone's own back gesture does not close it. Add pushState + popstate
// here when Android matters.
import { useLayoutEffect, useRef, useState } from 'react';

export function useSubPage<T>() {
  const [page, setPage] = useState<T | null>(null);
  const from = useRef(0);
  const inside = page !== null;
  useLayoutEffect(() => {
    scrollTo(0, inside ? 0 : from.current);
  }, [inside]);
  const open = (next: T) => {
    if (!inside) from.current = scrollY;
    setPage(next);
  };
  return [page, open, () => setPage(null)] as const;
}
