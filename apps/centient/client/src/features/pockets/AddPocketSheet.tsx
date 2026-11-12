// Adds a pocket, in a color not used in its account yet. From an account's card the account is fixed;
// from Settings you pick which account it goes inside.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import type { Envelope } from '../../../../src/repos/envelopes';
import { POCKET_KINDS } from '../../lib/format';
import { nextPocketColor } from '../../lib/pocketColors';
import { catalog, everyday } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import { ColorPicker } from '../../ui/ColorPicker';
import { DateRow, InputRow, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { pocketApi } from '../../models/pocket';
import { persist } from '../../models/query';

const KINDS = (Object.keys(POCKET_KINDS) as Envelope['kind'][]).map(k => ({
  value: k,
  label: POCKET_KINDS[k],
}));
const colorsIn = (accountId: string | null) =>
  catalog.value.envelopes.filter(e => e.account_id === accountId).map(e => e.color);

export function AddPocketSheet({
  open,
  account,
  onClose,
}: {
  open: boolean;
  account?: Account;
  onClose: () => void;
}) {
  const holders = everyday();
  const [accountId, setAccountId] = useState<string | null>(account?.id ?? holders[0]?.id ?? null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(nextPocketColor(colorsIn(accountId)));
  const [kind, setKind] = useState<Envelope['kind']>('SPENDING');
  const [target, setTarget] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const inside = catalog.value.accounts.find(a => a.id === accountId);
  const error = !inside
    ? 'Pick an account'
    : !name.trim()
      ? 'Name the pocket'
      : kind === 'GOAL' && !target
        ? 'Enter the goal amount'
        : null;
  const add = async () => {
    const ok = await persist(() =>
      pocketApi.create({
        accountId: accountId!,
        name: name.trim(),
        kind,
        color,
        targetAmount: kind === 'GOAL' ? target : null,
        targetDate: kind === 'GOAL' && date ? date : null,
      }),
    );
    if (!ok) return;
    onClose();
    showToast(`Added to ${inside!.name}`);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? `New pocket in ${account.name}` : 'Add pocket'}
    >
      <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS} />
      <Group foot="It starts empty; move money into it from the account's balance whenever you like.">
        {!account && (
          <PickerRow
            label="Inside"
            value={accountId}
            options={holders.map(a => ({ value: a.id, label: a.name }))}
            onChange={setAccountId}
          />
        )}
        <InputRow
          label="Name"
          value={name}
          placeholder={kind === 'GOAL' ? 'e.g. Japan trip' : 'e.g. Rent'}
          onInput={setName}
        />
        {kind === 'GOAL' && (
          <>
            <AmountField
              label="Goal"
              value={target}
              currency={inside?.currency_code ?? 'IDR'}
              onChange={setTarget}
            />
            <DateRow label="By" value={date} onChange={setDate} optional />
          </>
        )}
      </Group>
      <ColorPicker value={color} onChange={setColor} />
      <Block>
        <Button large rounded disabled={Boolean(error)} onClick={add}>
          {error ?? 'Add pocket'}
        </Button>
      </Block>
    </Sheet>
  );
}
