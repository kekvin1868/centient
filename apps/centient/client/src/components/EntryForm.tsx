// The full entry form: Spent / Received / Moved, used by chips, Edit, and "+ Add manually".
import { AmountField } from './AmountField';
import { InputRow, PickerRow, StepperRow } from './Fields';
import { Group } from './List';
import { Segmented } from './Segmented';
import { formatMoney } from '../lib/format';
import type { EntryType, Form } from '../lib/form';
import { active, catalog, everyday } from '../state';

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' },
];

export function EntryForm({ form, onChange, lockType }: { form: Form; onChange: (f: Form) => void; lockType?: boolean }) {
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const cat = catalog.value;
  const accounts = everyday().map(a => ({ value: a.id, label: a.name }));
  const allAccounts = active(cat.accounts).map(a => ({ value: a.id, label: a.name }));
  const currency = cat.accounts.find(a => a.id === form.accountId)?.currency_code ?? 'IDR';
  const categories = active(cat.categories).filter(c => c.kind === form.type && c.name !== 'Balance adjustment' && c.name !== 'Opening balance')
    .map(c => ({ value: c.id, label: c.name }));
  const pockets = active(cat.envelopes).map(e => ({ value: e.id, label: e.name }));
  const ious = active(cat.accounts).filter(a => a.kind === 'IOU').map(a => ({ value: a.id, label: a.name }));

  return (
    <>
      {form.type !== 'ALLOCATE' && (
        <div style="margin-bottom:16px">
          <Segmented label="Type" value={form.type} disabled={lockType} options={TYPES}
            onChange={t => set({ type: t, categoryId: null, toAccountId: null, split: null })} />
        </div>
      )}
      <Group>
        <AmountField value={form.amount} currency={currency} onChange={amount => set({ amount })} />
        {form.originalAmount !== null && form.originalCurrency && (
          <p class="small muted" style="margin:-4px 16px 10px">Price was {formatMoney(form.originalAmount, form.originalCurrency)}</p>
        )}
      </Group>
      {(form.type === 'EXPENSE' || form.type === 'INCOME') && (
        <Group>
          <InputRow label={form.type === 'EXPENSE' ? 'Where' : 'From'} value={form.merchant} placeholder="Optional" onInput={merchant => set({ merchant })} />
          <PickerRow label="Category" value={form.categoryId} options={categories} onChange={categoryId => set({ categoryId })} />
          <PickerRow label={form.type === 'EXPENSE' ? 'Paid with' : 'Into'} value={form.accountId} options={accounts} onChange={accountId => set({ accountId })} />
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
        <details class="more" open={Boolean(form.note || form.envelopeId || (form.split && form.split > 1))} style="border-top:0">
          <summary>More options</summary>
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
            <PickerRow label="Pocket" value={form.envelopeId} options={pockets} placeholder="Account's usual" onChange={envelopeId => set({ envelopeId })} />
          )}
          <InputRow label="Note" value={form.note} placeholder="Optional" onInput={note => set({ note })} />
        </details>
      </Group>
    </>
  );
}
