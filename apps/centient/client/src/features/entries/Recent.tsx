// Home's recent activity for the selected account, with See all.
import { Block, Button } from 'konsta/react';
import { useEffect } from 'react';
import { selectedAccount, version } from '../../lib/state';
import { EntryList, type Entry } from './EntryList';
import { useEntries } from './useEntries';

export function Recent({ onOpen, onSeeAll }: { onOpen: (e: Entry) => void; onSeeAll: () => void }) {
  const { items, more, loaded, load } = useEntries({ account: selectedAccount.value }, 20, selectedAccount.value ?? 'all');
  useEffect(() => { load(false); }, [version.value, selectedAccount.value]);
  if (!loaded) return null;
  return (
    <>
      <EntryList entries={items} onOpen={onOpen} empty="Nothing logged yet. Type above, for example: kopi 25rb gopay" />
      {more && <Block><Button large rounded tonal onClick={onSeeAll}>See all</Button></Block>}
    </>
  );
}
