// Keeps removed items on screen for a moment, flagged `gone`, so they can play an exit before they unmount.
// Each reappears where it was. Returns every current item plus the departing ones, in order.
import { useLayoutEffect, useRef, useState } from 'react';
import { reducedMotion } from '../../lib/motion';

export function useExits<T>(items: T[], keyOf: (t: T) => string, ms = 320): { item: T; key: string; gone: boolean }[] {
  const [gone, setGone] = useState<{ item: T; key: string; at: number }[]>([]);
  const prev = useRef(items);
  const keys = items.map(keyOf).join('\n');
  useLayoutEffect(() => {
    const now = new Set(items.map(keyOf));
    const out = prev.current.map((item, at) => ({ item, at, key: keyOf(item) })).filter(x => !now.has(x.key));
    prev.current = items;
    if (!out.length) return;
    setGone(g => [...g.filter(x => !now.has(x.key)), ...out]);
    const t = setTimeout(() => setGone(g => g.filter(x => !out.includes(x))), reducedMotion() ? 0 : ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  const list = items.map(item => ({ item, key: keyOf(item), gone: false }));
  for (const g of [...gone].sort((a, b) => a.at - b.at)) {
    if (!list.some(x => x.key === g.key)) list.splice(Math.min(g.at, list.length), 0, { item: g.item, key: g.key, gone: true });
  }
  return list;
}
