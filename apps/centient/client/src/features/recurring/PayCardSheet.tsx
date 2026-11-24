// "I paid it" on a card bill: which account paid, how much and when; saves a transfer into the card. The day can be
// moved back (paid yesterday, logged today, around closing day) but not ahead: a bill shows paid only once it is.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { everyday } from '../../lib/state';
import { entryApi } from '../../models/entry';
import { attempt } from '../../lib/run';
import type { Account } from '../../models/workspace';
import { AmountField } from '../../ui/AmountField';
import { DateRow, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

export function PayCardSheet({
  card,
  left,
  today,
  onClose,
}: {
  card: Pick<Account, 'id' | 'name' | 'currency_code'>;
  /** What is left of the bill: the amount offered. */
  left: number;
  today: string;
  onClose: () => void;
}) {
  // Money moves between accounts of one currency without a rate, so only those are offered.
  const sources = everyday().filter(
    a => a.id !== card.id && a.currency_code === card.currency_code,
  );
  const [from, setFrom] = useState<string | null>(sources.length === 1 ? sources[0].id : null);
  const [amount, setAmount] = useState<number | null>(left);
  const [date, setDate] = useState(today);
  const error = !from
    ? 'Pick the account that paid'
    : !amount
      ? 'Enter the amount'
      : date > today
        ? 'Log it once it is paid'
        : null;
  const save = async () => {
    if (!from || !amount) return;
    const paid = await attempt(() =>
      entryApi.log({
        type: 'TRANSFER',
        fromAccountId: from,
        toAccountId: card.id,
        amount,
        date,
      }),
    );
    if (!paid) return;
    onClose();
    showToast('Payment logged');
  };
  return (
    <Sheet open onClose={onClose} title={`Pay ${card.name}`}>
      <Group>
        <PickerRow
          label="Paid from"
          value={from}
          options={sources.map(a => ({ value: a.id, label: a.name }))}
          onChange={setFrom}
        />
        <AmountField value={amount} currency={card.currency_code} onChange={setAmount} />
        <DateRow label="Paid on" value={date} onChange={setDate} />
      </Group>
      <Block>
        <Button large rounded disabled={Boolean(error)} onClick={save}>
          {error ?? 'Log the payment'}
        </Button>
      </Block>
    </Sheet>
  );
}
