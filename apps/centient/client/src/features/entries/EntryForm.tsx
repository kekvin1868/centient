// The full entry form: Spent / Received / Moved, used by chips, Edit, and "+ Add manually".
import { ListItem } from 'konsta/react';
import { useState } from 'react';
import { AmountField } from '../../ui/AmountField';
import { InputRow, PickerRow, StepperRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { formatMoney } from '../../lib/format';
import type { EntryType, Form } from './form';
import { active, catalog, everyday } from '../../lib/state';

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' },
];

export function EntryForm({ form, onChange, lockType }: { form: Form; onChange: (f: Form) => void; lockType?: boolean }) {
  // The server keeps an entry's type on edit (TYPE_LOCKED), so the switch is hidden then.
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const [more, setMore] = useState(Boolean(form.note || form.envelopeId || (form.split && form.split > 1)));
  const cat = catalog.value;
  const accounts = everyday().map(a => ({ value: a.id, label: a.name }));
  const allAccounts = active(cat.accounts).map(a => ({ value: a.id, label: a.name }));
  const currency = cat.accounts.find(a => a.id === form.accountId)?.currency_code ?? 'IDR';
  const categories = active(cat.categories).filter(c => c.kind === form.type && c.name !== 'Balance adjustment' && c.name !== 'Opening balance')
    .map(c => ({ value: c.id, label: c.name }));
  // Pockets of the chosen account only (a pocket belongs to one account); none picked = its Main pocket.
  const pockets = active(cat.envelopes).filter(e => e.account_id === form.accountId).map(e => ({ value: e.id, label: e.name }));
  const ious = active(cat.accounts).filter(a => a.kind === 'IOU').map(a => ({ value: a.id, label: a.name }));

  return (
    <>
      {form.type !== 'ALLOCATE' && !lockType && (
        <Segmented label="Type" value={form.type} options={TYPES}
          onChange={t => set({ type: t, categoryId: null, toAccountId: null, split: null })} />
      )}
      <Group>
        <AmountField value={form.amount} currency={currency} onChange={amount => set({ amount })} />
        {form.originalAmount !== null && form.originalCurrency && (
          <ListItem title={<span className="text-sm text-muted">Price was {formatMoney(form.originalAmount, form.originalCurrency)}</span>} />
        )}
      </Group>
      {(form.type === 'EXPENSE' || form.type === 'INCOME') && (
        <Group>
          <InputRow label={form.type === 'EXPENSE' ? 'Where' : 'From'} value={form.merchant} placeholder="Optional" onInput={merchant => set({ merchant })} />
          <PickerRow label="Category" value={form.categoryId} options={categories} onChange={categoryId => set({ categoryId })} />
          <PickerRow label={form.type === 'EXPENSE' ? 'Paid with' : 'Into'} value={form.accountId} options={accounts} onChange={accountId => set({ accountId, envelopeId: null })} />
          <InputRow label="Date" type="date" value={form.date} onInput={date => set({ date })} />
        </Group>
      )}
      {form.type === 'TRANSFER' && (
        <Group>
          <PickerRow label="From" value={form.accountId} options={allAccounts} onChange={accountId => set({ accountId })} />
          <PickerRow label="To" value={form.toAccountId} options={allAccounts} onChange={toAccountId => set({ toAccountId })} />
          <AmountField label="Admin fee (optional)" value={form.fee} onChange={fee => set({ fee })} />
          <InputRow label="Date" type="date" value={form.date} onInput={date => set({ date })} />
        </Group>
      )}
      <Group>
        <ListItem link linkComponent="button" linkProps={{ type: 'button', onClick: () => setMore(!more), 'aria-expanded': more }}
          chevron={false} title={<span className="text-primary">{more ? 'Fewer options' : 'More options'}</span>} />
        {more && (<>
          {form.type === 'EXPENSE' && (
            <>
              <StepperRow label="Split with (people, incl. you)" value={form.split ?? 1} min={1} max={50}
                onChange={n => set({ split: n > 1 ? n : null, iouAccountId: n > 1 ? form.iouAccountId ?? ious[0]?.value ?? null : null })} />
              {form.split && form.split > 1 && ious.length > 1 && (
                <PickerRow label="Who owes you" value={form.iouAccountId} options={ious} onChange={iouAccountId => set({ iouAccountId })} />
              )}
            </>
          )}
          {(form.type === 'EXPENSE' || form.type === 'INCOME') && (
            <PickerRow label="Pocket" value={form.envelopeId} options={pockets} placeholder="Main" onChange={envelopeId => set({ envelopeId })} />
          )}
          <InputRow label="Note" value={form.note} placeholder="Optional" onInput={note => set({ note })} />
        </>)}
      </Group>
    </>
  );
}
