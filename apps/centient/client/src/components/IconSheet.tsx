// Pick an entry's icon. The field is focused so the phone's keyboard opens (web pages can't open the emoji
// keyboard directly; tap its 😊 / 🌐 key), and a grid of common picks is one tap away. "Use for every …"
// also remembers it for the entry's merchant. Reset goes back to the category's emoji.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../api';
import { categoryEmoji, entryRow } from '../lib/labels';
import { attempt } from '../lib/run';
import { catalog, refresh } from '../state';
import type { Entry } from './EntryList';
import { ToggleRow } from './Fields';
import { Group } from './List';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

const PICKS = ['☕', '🧋', '🍜', '🍚', '🍔', '🍕', '🍣', '🍰', '🛵', '🚗', '🚌', '⛽', '🏠', '💡', '📱', '🛍️', '👕', '💊', '🎮', '🎬', '📚', '🎁', '✈️', '🐱', '💼', '💰', '🧾', '🎉'];
const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].map(x => x.segment);
const isEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

export function IconSheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const r = entry ? entryRow(entry, catalog.value) : null;
  const merchant = entry?.transactions.find(t => t.merchant)?.merchant ?? null;
  const [icon, setIcon] = useState(r?.emoji ?? '');
  const [forMerchant, setForMerchant] = useState(Boolean(merchant));
  if (!entry || !r) return null;
  const save = (value: string | null) => attempt(async () => {
    await call(client.api.entries[':id'].icon.$patch({ param: { id: entry.id }, json: { icon: value, forMerchant: Boolean(merchant) && forMerchant } }));
    onClose();
    showToast(value ? 'Icon saved' : 'Back to the category icon');
    await refresh();
  });
  const category = categoryEmoji(catalog.value.categories.find(c => c.id === entry.transactions[0]?.category_id)?.name, entry.command?.type);
  return (
    <Sheet open onClose={onClose} title={`Icon for ${r.title}`}>
      <div className="mx-4 my-4 flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-raised-2 text-[34px]" aria-hidden="true">{icon || category}</span>
        <label className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-muted">Type or pick an emoji (tap 😊 on your keyboard)</span>
          <input autoFocus aria-label="Emoji" className="panel mt-1.5 w-full rounded-2xl bg-white px-4 py-2.5 text-[24px] outline-none dark:bg-raised" value={icon}
            onChange={e => { const last = graphemes(e.target.value).filter(isEmoji).at(-1); setIcon(last ?? ''); }} />
        </label>
      </div>
      <div className="mx-4 grid grid-cols-7 gap-2" role="group" aria-label="Common icons">
        {PICKS.map(p => (
          <button key={p} type="button" aria-label={p} aria-pressed={icon === p} onClick={() => setIcon(p)}
            className={`grid aspect-square place-items-center rounded-2xl text-[24px] active:opacity-70 ${icon === p ? 'bg-miku' : 'bg-raised'}`}>{p}</button>
        ))}
      </div>
      {merchant && <Group><ToggleRow label={`Use for every ${r.title}`} checked={forMerchant} onChange={setForMerchant} /></Group>}
      <Block className="flex flex-col gap-2.5">
        <Button large rounded disabled={!icon} onClick={() => save(icon)}>Save</Button>
        <Button large rounded tonal onClick={() => save(null)}>Use the category icon ({category})</Button>
      </Block>
    </Sheet>
  );
}
