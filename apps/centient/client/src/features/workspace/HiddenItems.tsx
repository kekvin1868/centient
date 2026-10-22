// Hidden accounts, pockets and categories, behind a toggle, each with Show to bring it back.
import { Button, ListItem } from 'konsta/react';
import { useState } from 'react';
import { patchRow } from '../../lib/api';
import { attempt } from '../../lib/run';
import { catalog, refresh } from '../../lib/state';
import { Group, Row } from '../../ui/List';

type Table = 'accounts' | 'envelopes' | 'categories';

export function HiddenItems() {
  const [open, setOpen] = useState(false);
  const cat = catalog.value;
  const rows: { table: Table; what: string; row: { id: string; name: string } }[] = [
    ...cat.accounts.filter(a => a.archived_at).map(row => ({ table: 'accounts' as const, what: 'Account', row })),
    ...cat.envelopes.filter(e => e.archived_at).map(row => ({ table: 'envelopes' as const, what: 'Pocket', row })),
    ...cat.categories.filter(c => c.archived_at).map(row => ({ table: 'categories' as const, what: 'Category', row })),
  ];
  if (!rows.length) return null;
  return (
    <Group label="Hidden">
      <ListItem link linkComponent="button" chevron={false} linkProps={{ type: 'button', onClick: () => setOpen(!open), 'aria-expanded': open }}
        title={<span className="text-primary">{open ? 'Hide the list' : `Show ${rows.length} hidden item${rows.length === 1 ? '' : 's'}`}</span>} />
      {open && rows.map(r => <Row key={r.row.id} title={r.row.name} sub={r.what} trail={<ShowButton table={r.table} id={r.row.id} />} />)}
    </Group>
  );
}

function ShowButton({ table, id }: { table: Table; id: string }) {
  return <Button clear inline small onClick={() => attempt(async () => { await patchRow(table, id, { archived: false }); await refresh(); })}>Show</Button>;
}
