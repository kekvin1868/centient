// Set, change or remove a monthly budget for a category, a pocket, or both, in one currency: a pocket's own, or
// for a category alone the one picked (rupiah unless changed).
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../../lib/api';
import { pocketLabel } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { active, catalog, refresh } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { CurrencyPicker } from '../../ui/CurrencyPicker';
import { PickerRow } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import type { BudgetStatus } from './forecast';

export type BudgetRow = {
  id: string; categoryId: string | null; envelopeId: string | null; currency: string; limit: number; spent: number; remaining: number;
  percent: number; safePerDay: number | null; daysGone: number | null; cycleDays: number; projected: number | null; status: BudgetStatus;
};

export function BudgetSheet({ budget, onClose }: { budget: BudgetRow | 'new' | null; onClose: () => void }) {
  const initial = budget === 'new' ? null : budget;
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [envelopeId, setEnvelopeId] = useState<string | null>(initial?.envelopeId ?? null);
  const [limit, setLimit] = useState<number | null>(initial?.limit ?? null);
  const [picked, setPicked] = useState(initial?.currency ?? 'IDR');
  const [confirm, setConfirm] = useState(false);
  if (!budget) return null;
  const cat = catalog.value;
  const editing = budget !== 'new';
  const pocketCurrency = cat.envelopes.find(e => e.id === envelopeId)?.currency_code;
  const currency = editing ? initial!.currency : pocketCurrency ?? picked;
  const error = !categoryId && !envelopeId ? 'Pick a category or a pocket' : !limit ? 'Enter a limit' : null;
  const save = async () => {
    if (error) return;
    const ok = await attempt(() => call(client.api.budgets.$put({ json: { categoryId, envelopeId, currency, limit: limit! } })));
    if (ok) { onClose(); showToast('Budget saved'); await refresh(); }
  };
  const remove = async () => {
    setConfirm(false);
    if (budget === 'new') return;
    const ok = await attempt(() => call(client.api.budgets[':id'].$delete({ param: { id: budget.id } })));
    if (ok) { onClose(); showToast('Budget removed'); await refresh(); }
  };
  return (
    <>
      <Sheet open={!confirm} onClose={onClose} title={editing ? 'Budget' : 'Set a budget'}>
        <Group foot="A new limit counts from this month on; past months keep theirs.">
          <PickerRow label="Category" value={categoryId} placeholder="Any category"
            options={active(cat.categories).filter(c => c.kind === 'EXPENSE').map(c => ({ value: c.id, label: c.name }))}
            onChange={v => !editing && setCategoryId(v)} />
          <PickerRow label="Pocket" value={envelopeId} placeholder="Any pocket"
            options={active(cat.envelopes).filter(e => e.kind === 'SPENDING' && cat.accounts.find(x => x.id === e.account_id)?.kind !== 'IOU').map(e => ({ value: e.id, label: pocketLabel(e.id) }))}
            onChange={v => !editing && setEnvelopeId(v)} />
          {editing || pocketCurrency
            ? <Row title="Currency" trail={currency} />
            : <CurrencyPicker value={picked} onChange={setPicked} />}
          <AmountField label="Limit per month" value={limit} currency={currency} onChange={setLimit} />
        </Group>
        <Block className="flex flex-col gap-2.5">
          <Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Save'}</Button>
          {editing && <Button large rounded tonal className="k-color-brand-red" onClick={() => setConfirm(true)}>Remove budget</Button>}
        </Block>
      </Sheet>
      <ConfirmSheet open={confirm} message="Remove this budget? Your entries stay." confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={remove} />
    </>
  );
}
