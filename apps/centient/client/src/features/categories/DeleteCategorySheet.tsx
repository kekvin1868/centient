// Delete a category: its entries, budget and quick-add words move to another category of the same kind.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Category } from '../../../../src/repos/categories';
import { call, client } from '../../lib/api';
import { attempt } from '../../lib/run';
import { active, catalog, refresh } from '../../lib/state';
import { PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

export function DeleteCategorySheet({ category, onClose, onDeleted }: { category: Category; onClose: () => void; onDeleted: () => void }) {
  const others = active(catalog.value.categories).filter(c => c.kind === category.kind && c.id !== category.id && !['Balance adjustment', 'Opening balance'].includes(c.name));
  const fallback = others.find(c => c.name === (category.kind === 'EXPENSE' ? 'Other' : 'Other income')) ?? others[0];
  const [moveTo, setMoveTo] = useState<string | null>(fallback?.id ?? null);
  const remove = () => attempt(async () => {
    await call(client.api.categories[':id'].$delete({ param: { id: category.id }, json: { moveTo: moveTo! } }));
    showToast(`Deleted ${category.name}`);
    onDeleted();
    await refresh();
  });
  return (
    <Sheet open onClose={onClose} title={`Delete ${category.name}`}>
      <Group foot={`Everything in ${category.name} (entries, its budget, quick-add words) moves there. ${category.name} is gone from your lists; a reset brings the starting categories back.`}>
        <PickerRow label="Move its entries to" value={moveTo} options={others.map(c => ({ value: c.id, label: c.name }))} onChange={setMoveTo} />
      </Group>
      <Block><Button large rounded className="k-color-brand-red" disabled={!moveTo} onClick={remove}>Delete category</Button></Block>
    </Sheet>
  );
}
