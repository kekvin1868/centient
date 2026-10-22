// First open: a new workspace already has three everyday accounts (Main Account, Dailies, Miscs). One screen
// to rename them and say what is in each now; then Home. No tour. Shown until the workspace is onboarded.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { call, client } from '../api';
import { AmountField } from '../components/AmountField';
import { InputRow } from '../components/Fields';
import { Group } from '../components/List';
import { ACCOUNT_KINDS } from '../lib/format';
import { attempt } from '../lib/run';
import { everyday, refresh } from '../state';

export function FirstRun({ onDone }: { onDone: () => void }) {
  // Bank first, then e-wallet, then card: the order people think of them in.
  const order = ['BANK', 'EWALLET', 'DEBIT_CARD', 'CASH'];
  const accounts = [...everyday()].sort((a, b) => (order.indexOf(a.kind) + 1 || 9) - (order.indexOf(b.kind) + 1 || 9));
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(accounts.map(a => [a.id, a.name])));
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const empty = accounts.some(a => !names[a.id]?.trim());

  const start = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      for (const a of accounts) {
        const name = names[a.id].trim();
        if (name !== a.name) await call(client.api[':table{accounts|envelopes|categories}'][':id'].$patch({ param: { table: 'accounts', id: a.id }, json: { name } }));
        const amount = amounts[a.id];
        // The first balance on an empty account is recorded as its opening balance.
        if (amount) await call(client.api.accounts[':id'].balance.$post({ param: { id: a.id }, json: { actual: amount } }));
      }
      await call(client.api.workspace.$patch({ json: { onboarded: true } }));
    });
    setBusy(false);
    if (ok) { await refresh(); onDone(); }
  };

  return (
    <main className="screen pb-10">
      <h1 className="screen-title">Welcome to Centient</h1>
      <p className="mx-4 mt-2 text-[16px] text-muted">
        Most people keep money in three places. Rename them to match yours and say what's in each now; you can add more accounts later.
      </p>
      {accounts.map(a => (
        <Group key={a.id} label={ACCOUNT_KINDS[a.kind] ?? a.kind}>
          <InputRow label="Name" value={names[a.id] ?? ''} onInput={v => setNames({ ...names, [a.id]: v })} />
          <AmountField label={`In ${names[a.id]?.trim() || 'it'} now`} value={amounts[a.id] ?? null} onChange={v => setAmounts({ ...amounts, [a.id]: v })} />
        </Group>
      ))}
      <Block className="flex flex-col gap-2.5">
        <Button large rounded disabled={busy || empty} onClick={start}>{empty ? 'Name every account' : busy ? 'Setting up…' : 'Start'}</Button>
      </Block>
    </main>
  );
}
