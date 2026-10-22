// The full entry form for one card (tap a card, or the pencil key with nothing typed).
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { EntryForm } from './EntryForm';
import { toCommand, type Form, type LogItem } from './form';

export function LogSheet({ item, onClose, onSave }: { item: LogItem | null; onClose: () => void; onSave: (i: LogItem) => unknown }) {
  const [form, setForm] = useState<Form | null>(item?.form ?? null);
  if (!item || !form) return null;
  const r = toCommand(form);
  return (
    <Sheet open onClose={onClose} title={item.text ? 'Check entry' : 'New entry'}>
      <EntryForm form={form} onChange={setForm} />
      <Block>
        <Button large rounded disabled={'error' in r} onClick={() => onSave({ ...item, askAmount: false, askCharged: false, form })}>
          {'error' in r ? r.error : 'Log it'}
        </Button>
      </Block>
    </Sheet>
  );
}
