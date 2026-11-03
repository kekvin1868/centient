// Add a spending or income category.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { InputRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { categoryApi } from '../../models/category';
import { persist } from '../../models/query';

export function AddCategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const add = async () => {
    if (await persist(() => categoryApi.create({ name: name.trim(), kind }))) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add category">
      <Segmented
        label="Kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'EXPENSE', label: 'Spending' },
          { value: 'INCOME', label: 'Income' },
        ]}
      />
      <Group>
        <InputRow label="Name" value={name} onInput={setName} />
      </Group>
      <Block>
        <Button large rounded disabled={!name.trim()} onClick={add}>
          {name.trim() ? 'Add category' : 'Enter a name'}
        </Button>
      </Block>
    </Sheet>
  );
}
