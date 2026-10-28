// Entries grouped by day, one row per entry. Rows animate in and out (AutoAnimate). Swipe a row left to
// unlock its actions (pencil = edit, bin = delete); tap the row to open it; tap its emoji to pick another.
// The actions stay reachable without the gesture: focusing one (keyboard, screen reader) slides its row open.
import autoAnimate from '@formkit/auto-animate';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { EntryView } from '../../../../src/repos/entries';
import type { Command } from '../../../../src/lib/schemas';
import { dayLabel, formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { buzz, reducedMotion, retroList } from '../../lib/motion';
import { catalog, hiddenEntries, me } from '../../lib/state';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { deleteWithUndo } from './EntrySheet';
import { IconSheet } from './IconSheet';
import { Group } from '../../ui/List';

export type Entry = EntryView & { command: Command | null };

const ACTIONS = 136; // two 64px actions + gap: how far a row slides open

export function EntryList({ entries, onOpen, empty = 'Nothing here yet.' }: { entries: Entry[]; onOpen: (e: Entry) => void; empty?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const animating = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [iconFor, setIconFor] = useState<Entry | null>(null);
  const today = me.value?.today ?? '';
  const visible = entries.filter(e => !hiddenEntries.value.has(e.id));
  // Start animating only once the list has content: the first fill appears at once, later changes animate.
  useEffect(() => {
    if (!animating.current && list.current && visible.length) { autoAnimate(list.current, retroList); animating.current = true; }
  }, [visible.length]);
  const days = [...new Set(visible.map(e => e.occurred_at.slice(0, 10)))];
  const del = deleting ? entryRow(deleting, catalog.value) : null;
  return (
    <div ref={list}>
      {!visible.length && <p className="text-center text-muted px-4 py-7" key="empty">{empty}</p>}
      {days.map(day => (
        <div key={day}>
          <Group label={dayLabel(day, today)}>
            {visible.filter(e => e.occurred_at.startsWith(day)).map(e => (
              <EntryRow key={e.id} entry={e} open={openId === e.id} onSwipe={o => setOpenId(o ? e.id : null)}
                onOpen={() => onOpen(e)} onDelete={() => { setOpenId(null); setDeleting(e); }} onIcon={() => setIconFor(e)} />
            ))}
          </Group>
        </div>
      ))}
      <ConfirmSheet open={Boolean(deleting)} message={del ? `Delete ${del.title}, ${formatMoney(del.amount, del.currency)}?` : ''} confirmLabel="Delete"
        onCancel={() => setDeleting(null)} onConfirm={() => { const e = deleting!; setDeleting(null); deleteWithUndo(e.id); }} />
      <IconSheet key={`icon:${iconFor?.id ?? 'none'}`} entry={iconFor} onClose={() => setIconFor(null)} />
    </div>
  );
}

function EntryRow({ entry: e, open, onSwipe, onOpen, onDelete, onIcon }: {
  entry: Entry; open: boolean; onSwipe: (open: boolean) => void; onOpen: () => void; onDelete: () => void; onIcon: () => void;
}) {
  const r = entryRow(e, catalog.value);
  const x = useMotionValue(0);
  // The actions "unlock" as the row slides: they grow from small and faint to full size.
  const reveal = useTransform(x, [-ACTIONS, -24, 0], [1, 0.55, 0.4]);
  const fade = useTransform(x, [-ACTIONS, -40, 0], [1, 0.3, 0]);
  const dragged = useRef(false);
  const settle = (to: number) => animate(x, to, reducedMotion() ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 });
  // Follow the list: another row opening (or an action) closes this one.
  useEffect(() => { settle(open ? -ACTIONS : 0); }, [open]);
  const amount = `${r.tone === 'out' ? '-' : r.tone === 'in' ? '+' : ''}${formatMoney(r.amount, r.currency)}`;

  return (
    <li className="entry-row relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
        <motion.button type="button" style={{ scale: reveal, opacity: fade }} onFocus={() => onSwipe(true)} onClick={() => { onSwipe(false); onOpen(); }}
          aria-label={`Edit ${r.title}`} className="grid size-14 place-items-center rounded-2xl bg-[#86cecb] text-[#0b0f10] active:opacity-70">
          <PencilSimple size={22} weight="bold" aria-hidden="true" />
        </motion.button>
        <motion.button type="button" style={{ scale: reveal, opacity: fade }} onFocus={() => onSwipe(true)} onClick={onDelete}
          aria-label={`Delete ${r.title}`} className="grid size-14 place-items-center rounded-2xl bg-pink text-white active:opacity-70">
          <Trash size={22} weight="bold" aria-hidden="true" />
        </motion.button>
      </div>
      <motion.div style={{ x }} drag="x" dragConstraints={{ left: -ACTIONS, right: 0 }} dragElastic={{ left: 0.15, right: 0.02 }} dragMomentum={false}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => {
          setTimeout(() => { dragged.current = false; });
          const opening = info.offset.x < -50 || info.velocity.x < -350;
          const closing = info.offset.x > 30 || info.velocity.x > 350;
          const next = open ? !closing : opening;
          if (next !== open) { if (next) buzz(); onSwipe(next); } else settle(open ? -ACTIONS : 0);
        }}
        className="relative flex items-center gap-3 bg-ios-light-surface-1 py-2.5 pl-4 pr-4 dark:bg-ios-dark-surface-1 touch-pan-y">
        <button type="button" onClick={() => { if (!dragged.current) onIcon(); }} aria-label={`Change the icon for ${r.title}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-raised-2 text-[19px] active:opacity-70">
          <span aria-hidden="true">{r.emoji}</span>
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left active:opacity-70"
          onClick={() => { if (dragged.current) return; if (open) onSwipe(false); else onOpen(); }}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px]">{r.title}</span>
            {r.sub && <span className="block truncate text-[15px] text-muted">{r.sub}</span>}
          </span>
          <span className={`num shrink-0 font-semibold ${r.tone === 'in' ? 'text-primary' : 'text-black dark:text-white'}`}>{amount}</span>
        </button>
      </motion.div>
    </li>
  );
}
