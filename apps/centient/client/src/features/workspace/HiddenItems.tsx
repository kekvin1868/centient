// Hidden accounts, pockets and categories, behind a toggle, each with Show to bring it back. A hidden pocket can
// also be deleted for good: swipe its row left (or focus the bin), confirm, and what was in it moves to its
// account's Main pocket (server: pockets.remove).
import { Trash } from '@phosphor-icons/react';
import { Button, ListItem } from 'konsta/react';
import { animate, useMotionValue } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useState } from 'react';
import { buzz, reducedMotion } from '../../lib/motion';
import { catalog } from '../../lib/state';
import { patchRow } from '../../models/api';
import { pocketApi } from '../../models/pocket';
import { persist } from '../../models/query';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Group, Row } from '../../ui/List';

type Table = 'accounts' | 'envelopes' | 'categories';
type Hidden = { table: Table; what: string; row: { id: string; name: string } };

export function HiddenItems() {
  const [open, setOpen] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<{ id: string; name: string; account: string } | null>(null);
  const cat = catalog.value;
  const accountName = (id: string) => cat.accounts.find(a => a.id === id)?.name ?? 'its account';
  const rows: Hidden[] = [
    ...cat.accounts
      .filter(a => a.archived_at)
      .map(row => ({ table: 'accounts' as const, what: 'Account', row })),
    ...cat.envelopes
      .filter(e => e.archived_at)
      .map(row => ({
        table: 'envelopes' as const,
        what: `Pocket · ${accountName(row.account_id)}`,
        row,
      })),
    ...cat.categories
      .filter(c => c.archived_at)
      .map(row => ({ table: 'categories' as const, what: 'Category', row })),
  ];
  if (!rows.length) return null;
  return (
    <Group label="Hidden" foot={open ? 'Swipe a pocket left to delete it.' : undefined}>
      <ListItem
        link
        linkComponent="button"
        chevron={false}
        linkProps={{ type: 'button', onClick: () => setOpen(!open), 'aria-expanded': open }}
        title={
          <span className="text-primary">
            {open
              ? 'Hide the list'
              : `Show ${rows.length} hidden item${rows.length === 1 ? '' : 's'}`}
          </span>
        }
      />
      {open &&
        rows.map(r => {
          const pocket = cat.envelopes.find(e => e.id === r.row.id);
          return r.table === 'envelopes' && pocket ? (
            <SwipeRow
              key={r.row.id}
              title={r.row.name}
              sub={r.what}
              trail={<ShowButton table={r.table} id={r.row.id} />}
              open={swiped === r.row.id}
              onSwipe={o => setSwiped(o ? r.row.id : null)}
              onDelete={() =>
                setDoomed({
                  id: r.row.id,
                  name: r.row.name,
                  account: accountName(pocket.account_id),
                })
              }
            />
          ) : (
            <Row
              key={r.row.id}
              title={r.row.name}
              sub={r.what}
              trail={<ShowButton table={r.table} id={r.row.id} />}
            />
          );
        })}
      <ConfirmSheet
        open={Boolean(doomed)}
        message={
          doomed
            ? `Delete ${doomed.name} for good? Everything in it moves to ${doomed.account}'s Main pocket.`
            : ''
        }
        confirmLabel="DELETE"
        onConfirm={() => {
          if (doomed) void persist(() => pocketApi.remove(doomed.id));
          setDoomed(null);
          setSwiped(null);
        }}
        onCancel={() => {
          setDoomed(null);
          setSwiped(null);
        }}
      />
    </Group>
  );
}

const ACTION = 76; // how far a row slides to show its bin

/** A row that slides left to show a delete button, like an entry row (features/entries/EntryList). */
function SwipeRow({
  title,
  sub,
  trail,
  open,
  onSwipe,
  onDelete,
}: {
  title: string;
  sub: string;
  trail: React.ReactNode;
  open: boolean;
  onSwipe: (open: boolean) => void;
  onDelete: () => void;
}) {
  const x = useMotionValue(0);
  const settle = (to: number) =>
    animate(
      x,
      to,
      reducedMotion() ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 },
    );
  useEffect(() => {
    settle(open ? -ACTION : 0);
  }, [open]);
  return (
    <li className="swipe-row">
      <div className="relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          <button
            type="button"
            onFocus={() => onSwipe(true)}
            onClick={onDelete}
            aria-label={`Delete ${title}`}
            className="grid size-12 place-items-center rounded-2xl bg-pink text-white active:opacity-70"
          >
            <Trash size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <m.div
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -ACTION, right: 0 }}
          dragElastic={{ left: 0.15, right: 0.02 }}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            const opening = info.offset.x < -40 || info.velocity.x < -350;
            const closing = info.offset.x > 30 || info.velocity.x > 350;
            const next = open ? !closing : opening;
            if (next !== open) {
              if (next) buzz();
              onSwipe(next);
            } else settle(open ? -ACTION : 0);
          }}
          className="relative flex touch-pan-y items-center justify-between gap-3 bg-ios-light-surface-1 py-2.5 pr-2 pl-4 dark:bg-ios-dark-surface-1"
        >
          <span className="min-w-0">
            <span className="block truncate">{title}</span>
            <span className="block truncate text-[15px] text-muted">{sub}</span>
          </span>
          {trail}
        </m.div>
      </div>
    </li>
  );
}

function ShowButton({ table, id }: { table: Table; id: string }) {
  return (
    <Button
      clear
      inline
      small
      onClick={() => persist(() => patchRow(table, id, { archived: false }))}
    >
      Show
    </Button>
  );
}
