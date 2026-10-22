// Edit an account: name, type, bill day (credit card / pay later), where new money goes, currency (only
// before it has entries); hide it, or delete it with its entries.
import { Block, BlockFooter, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/application/ports';
import { call, client, patchRow } from '../../lib/api';
import { ACCOUNT_KINDS } from '../../lib/format';
import { attempt } from '../../lib/run';
import { active, catalog, me, refresh } from '../../lib/state';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { InputRow, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export function EditAccountSheet({ account: a, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState(a?.name ?? '');
  const [defaultPocket, setDefaultPocket] = useState<string | null>(a?.default_envelope_id ?? null);
  const [currency, setCurrency] = useState(a?.currency_code ?? 'IDR');
  const [kind, setKind] = useState(a?.kind ?? 'BANK');
  const [dueDay, setDueDay] = useState<string | null>(a?.due_day ? String(a.due_day) : null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!a) return null;
  const billed = kind === 'CREDIT_CARD' || kind === 'PAYLATER';
  const patch = (json: Record<string, unknown>, done: string) => attempt(async () => {
    await patchRow('accounts', a.id, json);
    await refresh();
    onClose();
    showToast(done);
  });
  const save = () => patch({
    name: name.trim(), default_envelope_id: defaultPocket, due_day: billed && dueDay ? Number(dueDay) : null,
    ...(currency !== a.currency_code ? { currency_code: currency } : {}), ...(kind !== a.kind ? { kind } : {}),
  }, 'Saved');
  const askDelete = () => attempt(async () => {
    const page = await call(client.api.entries.$get({ query: { limit: '200', account: a.id } }));
    const n = page.items.length;
    setConfirmDelete(n === 0 ? `Delete ${a.name}? It has no entries.`
      : `Delete ${a.name} and its ${page.nextCursor ? `${n}+` : n} entr${n === 1 ? 'y' : 'ies'}? Balances and Pockets update to match.`);
  });
  const remove = () => attempt(async () => {
    setConfirmDelete(null);
    await call(client.api.accounts[':id'].$delete({ param: { id: a.id } }));
    await refresh();
    onClose();
    showToast('Account deleted');
  });

  return (
    <>
      <Sheet open={!confirmDelete} onClose={onClose} title={a.name}>
        <Group>
          <InputRow label="Name" value={name} onInput={setName} />
          {a.kind !== 'IOU' && (
            <PickerRow label="Type" value={kind} onChange={v => v && setKind(v)}
              options={Object.entries(ACCOUNT_KINDS).filter(([k]) => k !== 'IOU').map(([value, label]) => ({ value, label }))} />
          )}
          {billed && <PickerRow label="Bill due on day" value={dueDay} placeholder="Not set" onChange={setDueDay} options={DAYS} />}
          {a.kind !== 'IOU' && (
            <PickerRow label="New money goes to" value={defaultPocket} placeholder="Main"
              options={active(catalog.value.envelopes).filter(e => e.account_id === a.id).map(e => ({ value: e.id, label: e.name }))} onChange={v => v && setDefaultPocket(v)} />
          )}
          <PickerRow label="Currency" value={currency} options={Object.keys(me.value?.currencies ?? {}).map(c => ({ value: c, label: c }))} onChange={v => v && setCurrency(v)} />
        </Group>
        <BlockFooter inset>Currency can change only before the account has entries.</BlockFooter>
        <Block className="flex flex-col gap-2.5">
          <Button large rounded disabled={!name.trim()} onClick={save}>Save</Button>
          <Button large rounded tonal onClick={() => patch({ archived: true }, 'Hidden. Find it under Hidden to show it again.')}>Hide this account</Button>
          <Button large rounded tonal className="k-color-brand-red" onClick={askDelete}>Delete account</Button>
        </Block>
      </Sheet>
      <ConfirmSheet open={Boolean(confirmDelete)} message={confirmDelete ?? ''} confirmLabel="Delete account"
        onCancel={() => setConfirmDelete(null)} onConfirm={remove} />
    </>
  );
}
