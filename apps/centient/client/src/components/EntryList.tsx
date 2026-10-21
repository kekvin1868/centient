// Entries grouped by day, one row per entry. Rows animate in and out (AutoAnimate).
import autoAnimate from '@formkit/auto-animate';
import { useEffect, useRef } from 'react';
import type { EntryView } from '../../../src/application/ports';
import type { Command } from '../../../src/application/usecases';
import { dayLabel, formatMoney } from '../lib/format';
import { entryRow } from '../lib/labels';
import { catalog, hiddenEntries, me } from '../state';
import { Group, Row } from './List';

export type Entry = EntryView & { command: Command | null };

export function EntryList({ entries, onOpen, empty = 'Nothing here yet.' }: { entries: Entry[]; onOpen: (e: Entry) => void; empty?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const animating = useRef(false);
  const today = me.value?.today ?? '';
  const visible = entries.filter(e => !hiddenEntries.value.has(e.id));
  // Start animating only once the list has content: the first fill appears at once, later changes animate.
  useEffect(() => {
    if (!animating.current && list.current && visible.length) { autoAnimate(list.current, { duration: 220 }); animating.current = true; }
  }, [visible.length]);
  const days = [...new Set(visible.map(e => e.occurred_at.slice(0, 10)))];
  return (
    <div ref={list}>
      {!visible.length && <p className="text-center opacity-60 px-4 py-7" key="empty">{empty}</p>}
      {days.map(day => (
        <div key={day}>
          <Group label={dayLabel(day, today)}>
            {visible.filter(e => e.occurred_at.startsWith(day)).map(e => {
              const r = entryRow(e, catalog.value);
              return (
                <Row key={e.id} onClick={() => onOpen(e)} title={r.title} sub={r.sub || undefined}
                  media={<span className="grid place-items-center size-9 rounded-[10px] bg-black/5 dark:bg-white/10 text-[19px]" aria-hidden="true">{r.emoji}</span>}
                  trail={<span className={`num ${r.tone === 'in' ? 'text-primary' : 'text-black dark:text-white'}`}>{r.tone === 'out' ? '-' : r.tone === 'in' ? '+' : ''}{formatMoney(r.amount, r.currency)}</span>} />
              );
            })}
          </Group>
        </div>
      ))}
    </div>
  );
}
