// Entries grouped by day, one row per entry. Rows animate in and out (AutoAnimate). Swipe a row left to
// unlock its actions (pencil = edit, bin = delete); tap the row to open it; tap its emoji to pick another.
// The actions stay reachable without the gesture: focusing one (keyboard, screen reader) slides its row open.
// A split bill lists its people under it (BillPeople); a Paid back tied to bills in the same list sits there instead of
// on its own row (except in a person's own Activity, `keepPaybacks`). Deleting a bill people paid back asks first.
import autoAnimate from '@formkit/auto-animate';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { animate, useMotionValue, useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState } from 'react';
import type { EntryView } from '../../../../src/repos/entries';
import type { Command } from '../../../../src/lib/schemas';
import { dayLabel, formatMoney } from '../../lib/format';
import { entryRow } from '../../lib/labels';
import { buzz, reducedMotion, retroList } from '../../lib/motion';
import { catalog, hiddenEntries, me } from '../../lib/state';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import type { BillPerson, PaybackMode } from '../../models/entry';
import type { WaitingMark } from '../../models/waiting';
import { syncedIds } from '../../models/outbox';
import { PixelSign, type Sign } from '../../ui/PixelSign';
import { KeyChip } from '../../ui/KeyChip';
import { BillPeople } from './BillPeople';
import { deleteWithUndo } from './EntrySheet';
import { TiedSheet } from './TiedSheet';
import { IconSheet } from './IconSheet';
import { Group } from '../../ui/List';

/** `pocket`: set in a goal's log, where a row shows what moved in or out of that pocket and its balance after. */
/** `people`: a split bill's people with what they paid (the entry list sends it; a goal's log does not). */
export type Entry = EntryView & {
  command: Command | null;
  pocket?: { amount: number; balanceAfter: number; currency: string };
  people?: BillPerson[] | null;
  /** Not on the server yet (models/outbox): how its row is marked. */
  waiting?: WaitingMark;
};

/** The word on a row that is not on the server yet; none for one that just went through. */
const WAIT_WORD: Record<WaitingMark['state'], string> = {
  waiting: 'waiting',
  sending: 'sending',
  sent: '',
  refused: 'not sent',
  clash: 'changed elsewhere',
};
const WAIT_SIGN: Partial<Record<WaitingMark['state'], Sign>> = {
  waiting: 'warn',
  refused: 'stop',
  clash: 'stop',
};

const ACTIONS = 136; // two 64px actions + gap: how far a row slides open

/** A Paid back whose bills are all in this list: shown under them, not on its own row. */
export function tiedHere(e: Entry, ids: Set<string>) {
  const c = e.command;
  return Boolean(
    c?.type === 'TRANSFER' && c.bills?.length && c.bills.every(b => ids.has(b.entryId)),
  );
}

export function EntryList({
  entries,
  onOpen,
  empty = 'Nothing here yet.',
  keepPaybacks,
}: {
  entries: Entry[];
  onOpen: (e: Entry) => void;
  empty?: string;
  /** A person's own Activity: their Paid backs keep their rows (to open or delete them). */
  keepPaybacks?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const animating = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [iconFor, setIconFor] = useState<Entry | null>(null);
  const [tied, setTied] = useState<Entry | null>(null);
  const today = me.value?.today ?? '';
  const ids = new Set(entries.map(e => e.id));
  const visible = entries.filter(
    // A waiting Paid back is not under its bill yet (the server lists those), so it keeps its own row.
    e => !hiddenEntries.value.has(e.id) && (keepPaybacks || e.waiting || !tiedHere(e, ids)),
  );
  // Start animating only once the list has content: the first fill appears at once, later changes animate.
  useEffect(() => {
    if (!animating.current && list.current && visible.length) {
      autoAnimate(list.current, retroList);
      animating.current = true;
    }
  }, [visible.length]);
  const days = [...new Set(visible.map(e => e.occurred_at.slice(0, 10)))];
  const del = deleting ? entryRow(deleting, catalog.value) : null;
  return (
    <div ref={list}>
      {!visible.length && (
        <p className="text-center text-muted px-4 py-7" key="empty">
          {empty}
        </p>
      )}
      {days.map(day => (
        <div key={day}>
          <Group label={dayLabel(day, today)}>
            {visible
              .filter(e => e.occurred_at.startsWith(day))
              .map(e => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  open={openId === e.id}
                  onSwipe={o => setOpenId(o ? e.id : null)}
                  onOpen={() => onOpen(e)}
                  onDelete={() => {
                    setOpenId(null);
                    if (e.people?.some(p => p.paybacks.length)) setTied(e);
                    else setDeleting(e);
                  }}
                  onIcon={() => setIconFor(e)}
                />
              ))}
          </Group>
        </div>
      ))}
      <ConfirmSheet
        open={Boolean(deleting)}
        message={del ? `Delete ${del.title}, ${formatMoney(del.amount, del.currency)}?` : ''}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const e = deleting!;
          setDeleting(null);
          deleteWithUndo(e);
        }}
      />
      <TiedSheet
        open={Boolean(tied)}
        title={tied ? `Delete ${entryRow(tied, catalog.value).title}?` : ''}
        people={tied?.people ?? []}
        currency={tied ? entryRow(tied, catalog.value).currency : 'IDR'}
        onCancel={() => setTied(null)}
        onPick={(mode: PaybackMode) => {
          const e = tied!;
          setTied(null);
          deleteWithUndo(e, mode);
        }}
      />
      <IconSheet
        key={`icon:${iconFor?.id ?? 'none'}`}
        entry={iconFor}
        onClose={() => setIconFor(null)}
      />
    </div>
  );
}

function EntryRow({
  entry: e,
  open,
  onSwipe,
  onOpen,
  onDelete,
  onIcon,
}: {
  entry: Entry;
  open: boolean;
  onSwipe: (open: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
  onIcon: () => void;
}) {
  const r = entryRow(e, catalog.value);
  const x = useMotionValue(0);
  // The actions "unlock" as the row slides: they grow from small and faint to full size.
  const reveal = useTransform(x, [-ACTIONS, -24, 0], [1, 0.55, 0.4]);
  const fade = useTransform(x, [-ACTIONS, -40, 0], [1, 0.3, 0]);
  const dragged = useRef(false);
  const settle = (to: number) =>
    animate(
      x,
      to,
      reducedMotion() ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 },
    );
  // Follow the list: another row opening (or an action) closes this one.
  useEffect(() => {
    settle(open ? -ACTIONS : 0);
  }, [open]);
  const p = e.pocket;
  const tone = p ? (p.amount < 0 ? 'out' : 'in') : r.tone;
  const isTab = (id: string) => catalog.value.accounts.some(a => a.id === id && a.kind === 'IOU');
  const c = e.command;
  // ponytail: any move from your account into a person's tab reads as money returned; lending through a tab is rare.
  const returned = c?.type === 'TRANSFER' && isTab(c.toAccountId) && !isTab(c.fromAccountId);
  const amount = `${tone === 'out' ? '-' : tone === 'in' ? '+' : ''}${formatMoney(p ? Math.abs(p.amount) : r.amount, p ? p.currency : r.currency)}`;

  // Just reached the server after waiting: its border blinks out and a check shows (styles.css, Waiting entries).
  const synced = syncedIds.value.has(e.id);
  const sign = e.waiting && WAIT_SIGN[e.waiting.state];
  return (
    <li
      className="entry-row"
      data-waiting={e.waiting?.state}
      data-held={e.waiting?.held || undefined}
      data-synced={synced || undefined}
    >
      <div className="relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">
          <m.button
            type="button"
            style={{ scale: reveal, opacity: fade }}
            onFocus={() => onSwipe(true)}
            onClick={() => {
              onSwipe(false);
              onOpen();
            }}
            aria-label={`Edit ${r.title}`}
            className="grid size-14 place-items-center rounded-2xl bg-[#86cecb] text-[#0b0f10] active:opacity-70"
          >
            <PencilSimple size={22} weight="bold" aria-hidden="true" />
          </m.button>
          <m.button
            type="button"
            style={{ scale: reveal, opacity: fade }}
            onFocus={() => onSwipe(true)}
            onClick={onDelete}
            aria-label={`Delete ${r.title}`}
            className="grid size-14 place-items-center rounded-2xl bg-pink text-white active:opacity-70"
          >
            <Trash size={22} weight="bold" aria-hidden="true" />
          </m.button>
        </div>
        <m.div
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -ACTIONS, right: 0 }}
          dragElastic={{ left: 0.15, right: 0.02 }}
          dragMomentum={false}
          onDragStart={() => {
            dragged.current = true;
          }}
          onDragEnd={(_, info) => {
            setTimeout(() => {
              dragged.current = false;
            });
            const opening = info.offset.x < -50 || info.velocity.x < -350;
            const closing = info.offset.x > 30 || info.velocity.x > 350;
            const next = open ? !closing : opening;
            if (next !== open) {
              if (next) buzz();
              onSwipe(next);
            } else settle(open ? -ACTIONS : 0);
          }}
          className="relative flex items-center gap-3 bg-ios-light-surface-1 py-2.5 pl-4 pr-4 dark:bg-ios-dark-surface-1 touch-pan-y"
        >
          <button
            type="button"
            // An entry the server has not met has nowhere to keep an icon yet.
            disabled={Boolean(e.waiting)}
            onClick={() => {
              if (!dragged.current) onIcon();
            }}
            aria-label={`Change the icon for ${r.title}`}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-raised-2 text-[19px] active:opacity-70"
          >
            <span aria-hidden="true">{r.emoji}</span>
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left active:opacity-70"
            onClick={() => {
              if (dragged.current) return;
              if (open) onSwipe(false);
              else onOpen();
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px]">{r.title}</span>
              {r.sub && <span className="block truncate text-[15px] text-muted">{r.sub}</span>}
              {returned && (
                <span className="mt-1 block">
                  <KeyChip state="RETURNED" />
                </span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`num block font-semibold ${tone === 'in' ? 'text-primary' : 'text-black dark:text-white'}`}
              >
                {amount}
              </span>
              {p && (
                <span className="num block text-[13px] text-muted">
                  {formatMoney(p.balanceAfter, p.currency)}
                </span>
              )}
              {e.waiting && WAIT_WORD[e.waiting.state] && (
                <span
                  className="wait-word flex items-center justify-end gap-1 text-[13px] font-bold"
                  role="status"
                >
                  {sign && <PixelSign sign={sign} size={11} />}
                  {WAIT_WORD[e.waiting.state]}
                </span>
              )}
            </span>
          </button>
        </m.div>
      </div>
      {e.people?.length ? (
        <BillPeople bill={e.command} people={e.people} currency={r.currency} onMore={onOpen} />
      ) : null}
      {(e.waiting || synced) && <span key="bar" className="wait-bar" aria-hidden />}
      {synced && (
        <span key="check" className="wait-flash" aria-hidden>
          <PixelSign sign="check" size={30} />
        </span>
      )}
    </li>
  );
}
