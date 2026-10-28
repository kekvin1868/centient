// Moves money out of an account's balance (its Main pocket, shown as "Balance") or a pocket: to another pocket of
// the same account (ALLOCATE, the total stays), or to another account's balance (TRANSFER). Accounts in another
// currency aren't offered (that needs the amount received; the log box handles it). Opened from a pocket, the
// preset fills From / To ("Add money to Rent").
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import { call, client } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { me, refresh } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import type { Pocket } from './PocketRows';

type Bal = Account & { balance: number };
/** Pocket ids of this account; `to` may also be `account:<id>` (another account's balance). */
export type Move = { from: string | null; to: string | null };

export function MoveSheet({ preset, account: a, pockets, accounts, onClose }: {
  preset: Move | null; account: Bal; pockets: Pocket[]; accounts: Bal[]; onClose: () => void;
}) {
  const [from, setFrom] = useState<string | null>(preset?.from ?? null);
  const [to, setTo] = useState<string | null>(preset?.to ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  if (!preset) return null;
  const name = (p: Pocket) => (p.id === a.default_envelope_id ? 'Balance' : p.name);
  const opts = pockets.map(p => ({ value: p.id, label: `${name(p)} · ${formatMoney(p.balance, p.currency_code)}` }));
  const others = accounts.filter(x => x.id !== a.id && x.kind !== 'IOU' && !x.archived_at && x.currency_code === a.currency_code)
    .map(x => ({ value: `account:${x.id}`, label: x.name, group: 'Other accounts' }));
  const toAccount = to?.startsWith('account:') ? to.slice('account:'.length) : null;
  const target = preset.to && !toAccount ? pockets.find(p => p.id === preset.to) : null;
  const error = !from || !to ? 'Pick where from and where to' : from === to ? 'Pick two different places' : !amount ? 'Enter an amount' : null;
  const save = async () => {
    if (error) return;
    const date = me.value!.today;
    const ok = await attempt(() => call(client.api.transactions.$post({
      json: toAccount
        ? { type: 'TRANSFER', fromAccountId: a.id, toAccountId: toAccount, fromEnvelopeId: from!, amount: amount!, date }
        : { type: 'ALLOCATE', fromEnvelopeId: from!, toEnvelopeId: to!, amount: amount!, date },
    })));
    if (ok) { onClose(); showToast('Moved'); await refresh(); }
  };
  return (
    <Sheet open onClose={onClose} title={target ? `Add money to ${name(target)}` : 'Move money'}>
      <Group foot={toAccount ? `Moves money from ${a.name} to ${accounts.find(x => x.id === toAccount)?.name}'s balance.` : `Moves money inside ${a.name}. Its total doesn't change.`}>
        <PickerRow label="From" value={from} options={opts} onChange={setFrom} />
        <PickerRow label="To" value={to} options={[...opts, ...others]} onChange={setTo} />
        <AmountField value={amount} currency={a.currency_code} onChange={setAmount} />
      </Group>
      <Block><Button large rounded disabled={Boolean(error)} onClick={save}>{error ?? 'Move'}</Button></Block>
    </Sheet>
  );
}
