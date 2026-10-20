// Entries grouped by day, one row per entry. Rows animate in and out (AutoAnimate).
import autoAnimate from '@formkit/auto-animate';
import { useEffect, useRef } from 'preact/hooks';
import type { EntryView } from '../../../src/application/ports';
import type { Command } from '../../../src/application/usecases';
import { dayLabel, formatMoney } from '../lib/format';
import { entryRow } from '../lib/labels';
import { catalog, hiddenEntries, me } from '../state';

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
      {!visible.length && <p class="empty" key="empty">{empty}</p>}
      {days.map(day => (
        <section class="group" key={day}>
          <h2 class="group-label">{dayLabel(day, today)}</h2>
          <div class="group-body">
            {visible.filter(e => e.occurred_at.startsWith(day)).map(e => {
              const r = entryRow(e, catalog.value);
              return (
                <button type="button" class="row" key={e.id} onClick={() => onOpen(e)}>
                  <span class="row-emoji" aria-hidden="true">{r.emoji}</span>
                  <span class="row-main">
                    <span class="row-title" style="display:block">{r.title}</span>
                    {r.sub && <span class="row-sub" style="display:block">{r.sub}</span>}
                  </span>
                  <span class={`row-trail num ${r.tone}`}>{r.tone === 'out' ? '-' : r.tone === 'in' ? '+' : ''}{formatMoney(r.amount, r.currency)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
