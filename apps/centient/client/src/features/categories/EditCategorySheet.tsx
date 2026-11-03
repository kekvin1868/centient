// Edit a category: rename, hide, or delete (its entries move to another category). The ones the app looks
// up by name can't be deleted.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Category } from '../../../../src/repos/categories';
import { InputRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { DeleteCategorySheet } from './DeleteCategorySheet';
import type { RowPatch } from '../../models/api';
import { categoryApi } from '../../models/category';
import { persist } from '../../models/query';

// Looked up by name by the app (fees, opening balances, corrections).
const BUILT_IN = ['Fees', 'Opening balance', 'Balance adjustment'];

export function EditCategorySheet({
  category: c,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(c?.name ?? '');
  const [deleting, setDeleting] = useState(false);
  if (!c) return null;
  const patch = async (json: RowPatch, done: string) => {
    if (!(await persist(() => categoryApi.update(c.id, json)))) return;
    onClose();
    showToast(done);
  };
  return (
    <>
      <Sheet open={!deleting} onClose={onClose} title={c.name}>
        <Group>
          <InputRow label="Name" value={name} onInput={setName} />
        </Group>
        <Block className="flex flex-col gap-2.5">
          <Button
            large
            rounded
            disabled={!name.trim()}
            onClick={() => patch({ name: name.trim() }, 'Saved')}
          >
            Save
          </Button>
          <Button
            large
            rounded
            tonal
            onClick={() =>
              patch({ archived: true }, 'Hidden. Find it under Hidden to show it again.')
            }
          >
            Hide this category
          </Button>
          {!BUILT_IN.includes(c.name) && (
            <Button
              large
              rounded
              tonal
              className="k-color-brand-red"
              onClick={() => setDeleting(true)}
            >
              Delete category
            </Button>
          )}
        </Block>
      </Sheet>
      {deleting && (
        <DeleteCategorySheet category={c} onClose={() => setDeleting(false)} onDeleted={onClose} />
      )}
    </>
  );
}
