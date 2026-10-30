// Set, change or remove a monthly budget for a category, a pocket, or both, in one currency: a pocket's own, or
// for a category alone the one picked (rupiah unless changed). The switch makes it a temporary budget: a start
// day and a length, one limit for the whole run. A clash with another temporary one shows in a warning popup.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../../lib/api';
import { pocketLabel } from '../../lib/labels';
import { attempt } from '../../lib/run';
import { active, catalog, me, refresh } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { CurrencyPicker } from '../../ui/CurrencyPicker';
import { InputRow, PickerRow, ToggleRow } from '../../ui/Fields';
import { Group, Row } from '../../ui/List';
import { NoticeSheet } from '../../ui/NoticeSheet';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { monthDay, type BudgetStatus } from './forecast';

export type BudgetRow = {
  id: string; categoryId: string | null; envelopeId: string | null; currency: string; limit: number; spent: number; remaining: number;
  percent: number; safePerDay: number | null; daysGone: number | null; cycleDays: number; projected: number | null; status: BudgetStatus;
  startsOn: string | null; endsOn: string | null;
};

const DAYS = Array.from({ length: 89 }, (_, i) => String(i + 2)).map(d => ({ value: d, label: `${d} days` }));
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 864e5).toISOString().slice(0, 10);

export function BudgetSheet({ budget, onClose }: { budget: BudgetRow | 'new' | null; onClose: () => void }) {
  const initial = budget === 'new' ? null : budget;
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [envelopeId, setEnvelopeId] = useState<string | null>(initial?.envelopeId ?? null);
  const [limit, setLimit] = useState<number | null>(initial?.limit ?? null);
  const [picked, setPicked] = useState(initial?.currency ?? 'IDR');
  const today = me.value?.today ?? new Date().toISOString().slice(0, 10);
  const [temporary, setTemporary] = useState(Boolean(initial?.startsOn));
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? today);
  const [days, setDays] = useState(initial?.startsOn ? initial.cycleDays : 14);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!budget) return null;
  const cat = catalog.value;
  const editing = budget !== 'new';
  const pocketCurrency = cat.envelopes.find(e => e.id === envelopeId)?.currency_code;
  const currency = editing ? initial!.currency : pocketCurrency ?? picked;
  const error = !categoryId && !envelopeId ? 'Pick a category or a pocket' : !limit ? 'Enter a limit'
    : temporary && !editing && !(startsOn >= today) ? 'Start today or later' : null;
  const save = async () => {
    if (error) return;
    let clash = false;
    const ok = await attempt(() => call(client.api.budgets.$put({ json: { categoryId, envelopeId, currency, limit: limit!, ...(temporary ? { startsOn, days, id: initial?.id } : {}) } }))
      .catch((e: Error & { code?: string }) => {
        if (e.code !== 'BUDGET_OVERLAP') throw e;
        clash = true;
        setNotice(e.message);
      }));
    if (ok && !clash) { onClose(); showToast('Budget saved'); await refresh(); }
  };
  const remove = async () => {
    setConfirm(false);
    if (budget === 'new') return;
    const ok = await attempt(() => call(client.api.budgets[':id'].$delete({ param: { id: budget.id } })));
    if (ok) { onClose(); showToast('Budget removed'); await refresh(); }
  };
  return (
    <>
      <Sheet open={!confirm && notice === null} onClose={onClose} title={editing ? 'Budget' : 'Set a budget'}>
        <Group foot={temporary
          ? `Ends ${monthDay(addDays(startsOn, days))} at 00:00. Spending in these days still counts toward a monthly budget too.`
          : 'A new limit counts from this month on; past months keep theirs.'}>
          <PickerRow label="Category" value={categoryId} placeholder="Any category"
            options={active(cat.categories).filter(c => c.kind === 'EXPENSE').map(c => ({ value: c.id, label: c.name }))}
            onChange={v => !editing && setCategoryId(v)} />
          <PickerRow label="Pocket" value={envelopeId} placeholder="Any pocket"
            options={active(cat.envelopes).filter(e => e.kind === 'SPENDING' && cat.accounts.find(x => x.id === e.account_id)?.kind !== 'IOU').map(e => ({ value: e.id, label: pocketLabel(e.id) }))}
            onChange={v => !editing && setEnvelopeId(v)} />
          {editing || pocketCurrency
            ? <Row title="Currency" trail={currency} />
            : <CurrencyPicker value={picked} onChange={setPicked} />}
          {!editing && <ToggleRow label="Temporary" checked={temporary} onChange={setTemporary} />}
          {temporary && (editing
            ? <><Row title="Starts" trail={monthDay(startsOn)} /><Row title="Lasts" trail={`${days} days`} /></>
            : <><InputRow label="Starts" type="date" value={startsOn} onInput={setStartsOn} />
              <PickerRow label="Lasts" value={String(days)} options={DAYS} onChange={v => v && setDays(Number(v))} /></>)}
          <AmountField label={temporary ? `Limit for these ${days} days` : 'Limit per month'} value={limit} currency={currency} onChange={setLimit} />
        </Group>
        <Block className="flex flex-col gap-2.5">
          <Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Save'}</Button>
          {editing && <Button large rounded tonal className="k-color-brand-red" onClick={() => setConfirm(true)}>Remove budget</Button>}
        </Block>
      </Sheet>
      <NoticeSheet message={notice} onClose={() => setNotice(null)} />
      <ConfirmSheet open={confirm} message="Remove this budget? Your entries stay." confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={remove} />
    </>
  );
}
