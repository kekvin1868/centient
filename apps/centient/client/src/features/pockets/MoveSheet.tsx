// Moves money between pockets of one account. Opened from a pocket, `preset.to` is that pocket ("Add money to Rent").
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { catalog, me, nameOf, refresh } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import type { Pocket } from './PocketStack';

export type Move = { accountId: string; from: string | null; to: string | null };

export function MoveSheet({ preset, pockets, onClose }: { preset: Move | null; pockets: Pocket[]; onClose: () => void }) {
  const [from, setFrom] = useState<string | null>(preset?.from ?? null);
  const [to, setTo] = useState<string | null>(preset?.to ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  if (!preset) return null;
  const opts = pockets.map(p => ({ value: p.id, label: `${p.name} · ${formatMoney(p.balance, p.currency_code)}` }));
  const target = preset.to ? pockets.find(p => p.id === preset.to)?.name : null;
  const error = !from || !to ? 'Pick both pockets' : from === to ? 'Pick two different pockets' : !amount ? 'Enter an amount' : null;
  const save = async () => {
    if (error) return;
    const ok = await attempt(() => call(client.api.transactions.$post({
      json: { type: 'ALLOCATE', fromEnvelopeId: from!, toEnvelopeId: to!, amount: amount!, date: me.value!.today },
    })));
    if (ok) { onClose(); showToast('Moved'); await refresh(); }
  };
  return (
    <Sheet open onClose={onClose} title={target ? `Add money to ${target}` : 'Move money'}>
      <Group foot={`Moves money inside ${nameOf(catalog.value.accounts, preset.accountId)}. Its balance doesn't change.`}>
        <PickerRow label="From" value={from} options={opts} onChange={setFrom} />
        <PickerRow label="To" value={to} options={opts} onChange={setTo} />
        <AmountField value={amount} currency={pockets.find(p => p.id === from)?.currency_code ?? 'IDR'} onChange={setAmount} />
      </Group>
      <Block><Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Move'}</Button></Block>
    </Sheet>
  );
}
