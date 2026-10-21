// Add an account: name, type, what's in it now. Currency stays rupiah unless you ask for another.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../api';
import { attempt } from '../lib/run';
import { ACCOUNT_KINDS } from '../lib/format';
import { me, refresh } from '../state';
import { AmountField } from './AmountField';
import { InputRow, PickerRow } from './Fields';
import { Group } from './List';

const KINDS = ['BANK', 'EWALLET', 'CASH', 'CREDIT_CARD', 'PAYLATER', 'EXCHANGE'] as const;
type Kind = (typeof KINDS)[number];

export function AccountForm({ onDone, submitLabel = 'Add account' }: { onDone: () => void; submitLabel?: string }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('BANK');
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState('IDR');
  const [otherCurrency, setOtherCurrency] = useState(false);
  const owes = kind === 'CREDIT_CARD' || kind === 'PAYLATER';
  const currencies = Object.keys(me.value?.currencies ?? { IDR: 0 });

  const save = async () => {
    const ok = await attempt(() => call(client.api.accounts.$post({
      json: { name: name.trim(), kind, currency, openingBalance: amount ? (owes ? -amount : amount) : undefined },
    })));
    if (ok) { await refresh(); onDone(); }
  };

  return (
    <>
      <Group>
        <InputRow label="Name" value={name} placeholder="e.g. BCA, GoPay" onInput={setName} />
        <PickerRow label="Type" value={kind} options={KINDS.map(k => ({ value: k, label: ACCOUNT_KINDS[k] }))} onChange={v => v && setKind(v as Kind)} />
        {(otherCurrency || kind === 'EXCHANGE') && (
          <PickerRow label="Currency" value={currency} options={currencies.map(c => ({ value: c, label: c }))} onChange={v => v && setCurrency(v)} />
        )}
        <AmountField label={owes ? 'How much you owe now' : 'How much is in it now'} currency={currency} value={amount} onChange={setAmount} />
      </Group>
      <Block className="flex flex-col items-start gap-3 !mt-0">
        {!otherCurrency && kind !== 'EXCHANGE' && (
          <Button clear inline onClick={() => setOtherCurrency(true)}>Different currency</Button>
        )}
        <Button large disabled={!name.trim()} onClick={save}>{name.trim() ? submitLabel : 'Enter a name'}</Button>
      </Block>
    </>
  );
}
