// Add a spending or income category.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../../lib/api';
import { attempt } from '../../lib/run';
import { refresh } from '../../lib/state';
import { InputRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';

export function AddCategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const save = () => attempt(async () => {
    await call(client.api.categories.$post({ json: { name: name.trim(), kind } }));
    await refresh();
    onClose();
  });
  return (
    <Sheet open={open} onClose={onClose} title="Add category">
      <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'EXPENSE', label: 'Spending' }, { value: 'INCOME', label: 'Income' }]} />
      <Group><InputRow label="Name" value={name} onInput={setName} /></Group>
      <Block><Button large rounded disabled={!name.trim()} onClick={save}>{name.trim() ? 'Add category' : 'Enter a name'}</Button></Block>
    </Sheet>
  );
}
