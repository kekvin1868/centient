// "Log interest" on a card bill: the interest the bank printed on the statement, and where it came from (the
// unpaid part of the bill before, or a plan). Saved as an expense on the card in Fees & Interests, on the bill
// that just closed.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { recurringApi } from '../../models/recurring';
import { persist } from '../../models/query';
import type { Account } from '../../models/workspace';
import { AmountField } from '../../ui/AmountField';
import { dateText, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

export type InterestSource = {
  key: string;
  label: string;
  from: { month: string } | { planId: string };
};

export function LogInterestSheet({
  card,
  closedOn,
  sources,
  onClose,
}: {
  card: Pick<Account, 'id' | 'name' | 'currency_code'>;
  /** The last closing day: the bill the interest lands on. */
  closedOn: string;
  sources: InterestSource[];
  onClose: () => void;
}) {
  const [source, setSource] = useState<string | null>(sources.length === 1 ? sources[0].key : null);
  const [amount, setAmount] = useState<number | null>(null);
  const picked = sources.find(s => s.key === source);
  const error = !amount ? 'Enter the interest' : !picked ? 'Pick where it came from' : null;
  const save = async () => {
    if (!amount || !picked) return;
    if (!(await persist(() => recurringApi.logInterest(card.id, { amount, from: picked.from }))))
      return;
    onClose();
    showToast('Interest logged');
  };
  return (
    <Sheet open onClose={onClose} title="Log interest">
      <Group
        foot={`From ${card.name}'s statement. It goes on the bill closed on ${dateText(closedOn)}, in Fees & Interests.`}
      >
        <AmountField value={amount} currency={card.currency_code} onChange={setAmount} />
        <PickerRow
          label="Charged on"
          value={source}
          options={sources.map(s => ({ value: s.key, label: s.label }))}
          onChange={setSource}
        />
      </Group>
      <Block>
        <Button large rounded disabled={Boolean(error)} onClick={save}>
          {error ?? 'Log interest'}
        </Button>
      </Block>
    </Sheet>
  );
}
