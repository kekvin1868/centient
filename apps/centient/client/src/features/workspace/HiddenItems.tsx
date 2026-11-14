// Hidden accounts, pockets and categories, behind a toggle, each with Show to bring it back. A hidden pocket can
// also be deleted for good: swipe its row left (or focus the bin), confirm, and what was in it moves to its
// account's Main pocket (server: pockets.remove).
import { Trash } from '@phosphor-icons/react';
import { Button, ListItem } from 'konsta/react';
import * as m from 'motion/react-m';
import { useState } from 'react';
import { useSwipe } from '../../lib/motion';
import { catalog } from '../../lib/state';
import { patchRow } from '../../models/api';
import { pocketApi } from '../../models/pocket';
import { persist } from '../../models/query';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Group, Row } from '../../ui/List';

type Table = 'accounts' | 'envelopes' | 'categories';
/** `account`: a pocket's account name (only a pocket can be deleted, so only it carries one). */
type Hidden = { table: Table; what: string; row: { id: string; name: string }; account?: string };

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
      .map(row => {
        const account = accountName(row.account_id);
        return { table: 'envelopes' as const, what: `Pocket · ${account}`, row, account };
      }),
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
        rows.map(({ table, what, row, account }) =>
          account ? (
            <SwipeRow
              key={row.id}
              title={row.name}
              sub={what}
              trail={<ShowButton table={table} id={row.id} />}
              open={swiped === row.id}
              onSwipe={o => setSwiped(o ? row.id : null)}
              onDelete={() => setDoomed({ id: row.id, name: row.name, account })}
            />
          ) : (
            <Row
              key={row.id}
              title={row.name}
              sub={what}
              trail={<ShowButton table={table} id={row.id} />}
            />
          ),
        )}
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
  const { drag } = useSwipe(ACTION, open, onSwipe);
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
          {...drag}
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
