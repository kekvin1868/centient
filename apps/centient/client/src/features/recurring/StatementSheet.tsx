// "Enter statement" on a card bill: what the bank's statement says, in the paper's order. The total (to check the
// app's bill against), the minimum payment when printed (for "I paid it" and the bill's words), and the interest
// with where it came from (the unpaid part of the bill before, or a plan). Typed, never guessed. The gap with the
// app's bill shows as you type. Saved through the outbox (works with no signal): the statement for the bill
// closed on `card.cutOff`, the interest as a Fees & Interests expense on that bill; both are refused if that bill
// has closed by the time they arrive.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { entryApi } from '../../models/entry';
import { outbox } from '../../models/outbox';
import {
  statementGap,
  type CardStatement,
  type InterestSource,
  type Statement,
} from '../../models/recurring';
import { AmountField } from '../../ui/AmountField';
import { dateText, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

export function StatementSheet({
  account,
  card,
  statement,
  sources,
  onClose,
}: {
  account: { id: string; name: string; currency_code: string };
  card: CardStatement;
  /** What was typed before for this bill, if anything (it is replaced). */
  statement: Statement | null;
  sources: InterestSource[];
  onClose: () => void;
}) {
  const [total, setTotal] = useState<number | null>(statement?.total ?? null);
  const [minimum, setMinimum] = useState<number | null>(statement?.minimum ?? null);
  const [interest, setInterest] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(sources.length === 1 ? sources[0].key : null);
  const picked = sources.find(s => s.key === source);
  const money = (n: number) => formatMoney(n, account.currency_code);
  const gap = total === null ? null : statementGap(card, total, interest ?? 0);
  const error =
    total === null
      ? 'Enter the total'
      : minimum !== null && minimum > total
        ? 'The minimum is more than the total'
        : interest && !picked
          ? 'Pick where the interest came from'
          : null;

  const save = async () => {
    if (total === null || error) return;
    const ok = await attempt(async () => {
      if (interest && picked) await entryApi.logInterest(account.id, card.cutOff, interest, picked);
      outbox.statement({ accountId: account.id, closedOn: card.cutOff, total, minimum });
    });
    if (!ok) return;
    onClose();
    showToast('Statement saved');
  };

  return (
    <Sheet open onClose={onClose} title="Enter statement">
      <Group
        foot={`${account.name}'s statement for the bill closed on ${dateText(card.cutOff)}. Type what it says.`}
      >
        <AmountField
          label="Total"
          value={total}
          currency={account.currency_code}
          onChange={setTotal}
        />
        <AmountField
          label="Minimum payment (optional)"
          value={minimum}
          currency={account.currency_code}
          onChange={setMinimum}
        />
      </Group>
      {sources.length > 0 && (
        <Group
          label="Interest"
          foot="Only if the statement charges interest. It goes in Fees & Interests."
        >
          <AmountField
            label="Interest (optional)"
            value={interest}
            currency={account.currency_code}
            onChange={setInterest}
          />
          <PickerRow
            label="Charged on"
            value={source}
            options={sources.map(s => ({ value: s.key, label: s.label }))}
            onChange={setSource}
          />
        </Group>
      )}
      {gap !== null && (
        <p className="mx-4 text-[15px]" role="status" aria-label="Statement check">
          {gap === 0
            ? '✓ Matches the app'
            : gap > 0
              ? `⚠ The statement asks ${money(gap)} more than the app has`
              : `⚠ The app has ${money(-gap)} more than the statement`}
          <span className="block text-[13px] text-muted">
            App {money(card.bill + (interest ?? 0))} · Statement {money(total!)}
          </span>
        </p>
      )}
      <Block>
        <Button large rounded disabled={Boolean(error)} onClick={save}>
          {error ?? 'Save statement'}
        </Button>
      </Block>
    </Sheet>
  );
}
