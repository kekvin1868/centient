// Currency rows for forms (accounts, budgets): the chosen one, and on tap a search over the world list ("yen", "SGD",
// "dollar"). Inline in the form's list rather than its own sheet, so no dialog opens on top of a dialog.
import { CURRENCIES } from '@centient/money';
import { useState } from 'react';
import { InputRow } from './Fields';
import { Row } from './List';

const MAX_SHOWN = 8;

/** Codes first ("usd" finds USD before "Brunei Dollar"), then names; an empty query lists nothing. */
export function searchCurrencies(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const code = CURRENCIES.filter(c => c.code.toLowerCase().startsWith(q));
  return [...code, ...CURRENCIES.filter(c => !code.includes(c) && c.name.toLowerCase().includes(q))].slice(0, MAX_SHOWN);
}

export function CurrencyPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const name = CURRENCIES.find(c => c.code === value)?.name;
  const pick = (code: string) => { onChange(code); setOpen(false); setQuery(''); };

  return (
    <>
      <Row title="Currency" trail={<span className="max-w-[55vw] truncate">{value}{name ? ` · ${name}` : ''}</span>} chevron onClick={() => setOpen(!open)} />
      {open && <InputRow label="Search" value={query} placeholder="yen, euro, SGD" onInput={setQuery} />}
      {open && searchCurrencies(query).map(c => (
        <Row key={`currency:${c.code}`} title={`${c.code} · ${c.name}`} onClick={() => pick(c.code)} />
      ))}
    </>
  );
}
