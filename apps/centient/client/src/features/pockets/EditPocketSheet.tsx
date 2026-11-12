// Edit a pocket: name, kind (Spending / Savings; only a Spending pocket takes a budget), color, goal; hide it (the server refuses while money is still in it). Main keeps its
// name and can't be hidden.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Envelope } from '../../../../src/repos/envelopes';
import { POCKET_KINDS } from '../../lib/format';
import { pocketColor, POCKET_COLORS } from '../../lib/pocketColors';
import { catalog } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { ColorPicker } from '../../ui/ColorPicker';
import { DateRow, InputRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { pocketApi } from '../../models/pocket';
import { persist } from '../../models/query';

const KINDS = (['SPENDING', 'SAVINGS'] as const).map(k => ({ value: k, label: POCKET_KINDS[k] }));

export function EditPocketSheet({
  pocket: p,
  onClose,
}: {
  pocket: Envelope | null;
  onClose: () => void;
}) {
  const cat = catalog.value;
  const account = cat.accounts.find(a => a.id === p?.account_id);
  const main = account?.default_envelope_id === p?.id;
  const siblings = cat.envelopes.filter(e => e.account_id === p?.account_id && !e.archived_at);
  const [name, setName] = useState(p?.name ?? '');
  const [color, setColor] = useState(
    p
      ? pocketColor(
          p.color,
          Math.max(
            0,
            siblings.findIndex(e => e.id === p.id),
          ),
          main,
        )
      : POCKET_COLORS[0].hex,
  );
  const [kind, setKind] = useState(p?.kind ?? 'SPENDING');
  const [target, setTarget] = useState<number | null>(p?.target_amount ?? null);
  const [date, setDate] = useState(p?.target_date ?? '');
  if (!p || !account) return null;
  const switchable = !main && p.kind !== 'GOAL';
  const patch = async (json: Parameters<typeof pocketApi.update>[1], done: string) => {
    if (!(await persist(() => pocketApi.update(p.id, json)))) return;
    onClose();
    showToast(done);
  };
  const save = () =>
    patch(
      {
        ...(main ? {} : { name: name.trim() }),
        ...(switchable && kind !== p.kind ? { kind: kind as 'SPENDING' | 'SAVINGS' } : {}),
        color,
        ...(p.kind === 'GOAL' ? { target_amount: target, target_date: date || null } : {}),
      },
      'Saved',
    );
  return (
    <Sheet open onClose={onClose} title={`${p.name} · ${account.name}`}>
      {switchable && <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS} />}
      <Group>
        {!main && <InputRow label="Name" value={name} onInput={setName} />}

        {p.kind === 'GOAL' && (
          <>
            <AmountField
              label="Goal"
              value={target}
              currency={p.currency_code}
              onChange={setTarget}
            />
            <DateRow label="By" value={date} onChange={setDate} optional />
          </>
        )}
      </Group>
      <ColorPicker value={color} onChange={setColor} />
      <Block className="flex flex-col gap-2.5">
        <Button large rounded disabled={!main && !name.trim()} onClick={save}>
          Save
        </Button>
        {!main && (
          <Button large rounded tonal onClick={() => patch({ archived: true }, `${p.name} hidden`)}>
            Hide this pocket
          </Button>
        )}
      </Block>
    </Sheet>
  );
}
