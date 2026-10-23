// Add a plan: what, how much each installment, how many, who shares it (equally or custom), and whether
// it is already in the account's balance.
import { X } from '@phosphor-icons/react';
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/application/ports';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { active, catalog, me, refresh } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { InputRow, PickerRow, StepperRow, ToggleRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

type Person = { key: number; name: string; share: number | null };

export function NewPlanSheet({ open, account, onClose }: { open: boolean; account: Account; onClose: () => void }) {
  const today = me.value?.today ?? '';
  const cur = account.currency_code;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [count, setCount] = useState(3);
  const [firstDue, setFirstDue] = useState(today);
  const [paidCount, setPaidCount] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [split, setSplit] = useState<'equal' | 'custom'>('equal');
  const [myShare, setMyShare] = useState<number | null>(null);
  const [inBalance, setInBalance] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Equal split: everyone pays a whole share; you take the rounding (as with split bills).
  const n = people.length + 1;
  const each = amount ? Math.floor(amount / n) : 0;
  const shares = split === 'equal'
    ? { mine: amount ? amount - each * people.length : 0, others: people.map(() => each) }
    : { mine: myShare ?? 0, others: people.map(p => p.share ?? 0) };
  const sum = shares.mine + shares.others.reduce((s, x) => s + x, 0);
  const error = !name.trim() ? 'Name what you bought' : !amount ? 'Enter the installment amount' : !firstDue ? 'Pick the first due date'
    : people.some(p => !p.name.trim()) ? 'Name each person' : split === 'custom' && sum !== amount ? `Shares add up to ${formatMoney(sum, cur)}, not ${formatMoney(amount, cur)}`
    : people.length && shares.others.some(x => x <= 0) ? 'Every share must be more than zero'
    : !inBalance && shares.mine > 0 && !categoryId ? 'Pick a category' : null;
  const iouNames = active(catalog.value.accounts).filter(a => a.kind === 'IOU').map(a => a.name);

  const save = async () => {
    if (error || !amount) return;
    setBusy(true);
    const ok = await attempt(() => call(client.api.installments.$post({
      json: {
        accountId: account.id, name: name.trim(), amountPerInstallment: amount, installments: count, firstDue, paidCount,
        myShare: shares.mine, others: people.map((p, k) => ({ name: p.name.trim(), share: shares.others[k] })),
        alreadyInBalance: inBalance, categoryId: !inBalance && categoryId ? categoryId : undefined,
      },
    })));
    setBusy(false);
    if (ok) { onClose(); showToast('Installments added'); await refresh(); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add installments">
      <Group>
        <InputRow label="What" value={name} placeholder="e.g. iPhone" onInput={setName} />
        <AmountField label="Each installment" value={amount} currency={cur} onChange={setAmount} />
        <StepperRow label="Installments" value={count} min={1} max={36} onChange={v => { setCount(v); if (paidCount >= v) setPaidCount(v - 1); }} />
        <InputRow label="First due" type="date" value={firstDue} onInput={setFirstDue} />
        <StepperRow label="Already paid" value={paidCount} min={0} max={count - 1} onChange={setPaidCount} />
      </Group>

      <Group label="Who pays" foot={people.length ? 'Each person marks their own share paid every month.' : 'Add the people you split this with, if any.'}>
        {split === 'custom' && <AmountField label="Your share" value={myShare} currency={cur} onChange={setMyShare} />}
        {people.flatMap((p, k) => [
          <InputRow key={`${p.key}:name`} label={`Person ${k + 1}`} value={p.name} placeholder={iouNames[k] ?? 'Name'} onInput={v => setPeople(people.map(x => (x.key === p.key ? { ...x, name: v } : x)))} />,
          split === 'custom' ? <AmountField key={`${p.key}:share`} label={`${p.name || 'Their'} share`} value={p.share} currency={cur} onChange={v => setPeople(people.map(x => (x.key === p.key ? { ...x, share: v } : x)))} /> : null,
          <li key={`${p.key}:remove`}>
            <button type="button" className="flex w-full items-center gap-1.5 px-4 py-2 text-[14px] font-semibold text-muted active:opacity-60" onClick={() => setPeople(people.filter(x => x.key !== p.key))}>
              <X size={14} weight="bold" aria-hidden="true" />Remove {p.name.trim() || `person ${k + 1}`}
            </button>
          </li>,
        ])}
        <li><button type="button" className="w-full px-4 py-3 text-left font-semibold text-primary active:opacity-70" onClick={() => setPeople([...people, { key: Date.now(), name: '', share: null }])}>+ Add a person</button></li>
      </Group>
      {people.length > 0 && (
        <>
          <Segmented label="Split" value={split} onChange={setSplit} options={[{ value: 'equal', label: 'Equally' }, { value: 'custom', label: 'Custom' }]} />
          {split === 'equal' && amount ? <p className="mx-5 -mt-2 mb-2 text-[14px] text-muted">{n} people · {formatMoney(each, cur)} each{shares.mine !== each ? ` (you ${formatMoney(shares.mine, cur)})` : ''}</p> : null}
        </>
      )}

      <Group foot={inBalance ? `Nothing new is added to ${account.name}'s balance.${people.length ? " Others' remaining shares are added to what they owe you." : ''}`
        : `Logs what's left as spending on ${account.name}${people.length ? ', with the others\' shares owed to you' : ''}.`}>
        <ToggleRow label={`Already in ${account.name}'s balance`} checked={inBalance} onChange={setInBalance} />
        {!inBalance && shares.mine > 0 && (
          <PickerRow label="Category" value={categoryId}
            options={active(catalog.value.categories).filter(c => c.kind === 'EXPENSE').map(c => ({ value: c.id, label: c.name }))} onChange={setCategoryId} />
        )}
      </Group>
      <Block><Button large rounded disabled={Boolean(error) || busy} onClick={save}>{error ?? (busy ? 'Adding…' : 'Add installments')}</Button></Block>
    </Sheet>
  );
}
