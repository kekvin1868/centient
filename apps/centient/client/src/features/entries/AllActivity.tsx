// Every entry, filtered by type, account and dates, 50 at a time.
import { Block, Button } from 'konsta/react';
import { useEffect, useState } from 'react';
import { everyday, selectedAccount, version } from '../../lib/state';
import { InputRow, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { EntryList, type Entry } from './EntryList';
import { useEntries } from './useEntries';

const TYPE_FILTERS = [{ value: '', label: 'All' }, { value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' }];

export function AllActivity({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (e: Entry) => void }) {
  const [type, setType] = useState('');
  const [account, setAccount] = useState<string | null>(selectedAccount.value);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { items, more, load } = useEntries({ account, type, from, to }, 50);
  useEffect(() => { if (open) load(false); }, [open, type, account, from, to, version.value]);
  return (
    <Sheet open={open} onClose={onClose} title="All activity">
      <Segmented label="Show" value={type} onChange={setType} options={TYPE_FILTERS} />
      <Group>
        <PickerRow label="Account" value={account} placeholder="All accounts" options={everyday().map(a => ({ value: a.id, label: a.name }))} onChange={setAccount} />
        <InputRow label="From" type="date" value={from} onInput={setFrom} />
        <InputRow label="To" type="date" value={to} onInput={setTo} />
      </Group>
      <EntryList entries={items} onOpen={e => { onClose(); onOpen(e); }} empty="Nothing matches." />
      {more && <Block><Button large rounded tonal onClick={() => load(true)}>Load more</Button></Block>}
    </Sheet>
  );
}
