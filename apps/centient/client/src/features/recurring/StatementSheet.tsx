// "Enter statement" on a card bill: what the bank's statement says, in the paper's order. The total (to check the
// app's bill against), the minimum payment when printed (for "I paid it" and the bill's words), and interest with
// where it came from (the unpaid part of the bill before, or a plan). Typed, never guessed.
// Interest already on this bill is listed, not offered again (one per source per bill; the server refuses a
// second). The Total starts at what was typed before, else the app's bill, and moves with new interest until the
// Total itself is typed (then it is what the paper says, and stays put). The check (match, missing, over) shows as
// you type.
// Saved through the outbox (works with no signal): the statement for the bill closed on `card.cutOff`, new interest
// as a Fees & Interests expense on that bill; both are refused if that bill has closed by the time they arrive.
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import { formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { entryApi } from '../../models/entry';
import { outbox } from '../../models/outbox';
import {
  billLines,
  statementGap,
  type CardStatement,
  type InterestSource,
  type Statement,
} from '../../models/recurring';
import { AmountField } from '../../ui/AmountField';
import { dateText, PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { Tag } from '../../ui/Tag';
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
  /** Where new interest may come from: the server's choices less the ones already typed on this bill. */
  sources: InterestSource[];
  onClose: () => void;
}) {
  const [total, setTotal] = useState<number | null>(statement?.total ?? card.bill);
  /** Typed by hand in this sheet: from then on new interest leaves it alone. */
  const [ownTotal, setOwnTotal] = useState(false);
  const [minimum, setMinimum] = useState<number | null>(statement?.minimum ?? null);
  const [interest, setInterest] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(sources.length === 1 ? sources[0].key : null);
  const picked = sources.find(s => s.key === source);
  const money = (n: number) => formatMoney(n, account.currency_code);
  const logged = billLines(card).filter(l => l.kind === 'interest');
  const gap = total === null ? null : statementGap(card, total, interest ?? 0);
  // New interest is part of the statement's total: until the Total is typed, it moves by what the interest moved.
  const changeInterest = (next: number | null) => {
    const moved = (next ?? 0) - (interest ?? 0);
    if (!ownTotal && total !== null && moved) setTotal(Math.max(0, total + moved));
    setInterest(next);
  };
  const changeTotal = (next: number | null) => {
    setOwnTotal(true);
    setTotal(next);
  };
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
      <p className="mx-4 mt-3 text-[16px] leading-snug">
        Copy the numbers from <b>{account.name}</b>'s statement for the bill closed on{' '}
        <b>{dateText(card.cutOff)}</b>. The Total starts at the app's bill: change it to what the
        paper says.
      </p>
      <Group>
        <AmountField
          label="Total"
          value={total}
          currency={account.currency_code}
          onChange={changeTotal}
        />
        <AmountField
          label="Minimum payment (optional)"
          value={minimum}
          currency={account.currency_code}
          onChange={setMinimum}
        />
      </Group>

      {(logged.length > 0 || sources.length > 0) && (
        <section className="mx-4 mt-5" aria-label="Interest">
          <h3 className="text-[17px] font-bold">Interest</h3>
          {logged.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2" aria-label="Interest on this bill">
              {logged.map(l => (
                <li
                  key={l.key}
                  className="panel flex items-center gap-2 bg-white px-3 py-2.5 text-[15px] dark:bg-raised"
                >
                  <Tag tone="pink">on the bill</Tag>
                  <span className="min-w-0 flex-1 truncate">{l.detail}</span>
                  <span className="num shrink-0 font-bold">{money(l.amount)}</span>
                </li>
              ))}
              <li className="text-[14px] leading-snug text-muted">
                Already counted in the app's bill. To change or remove one, tap its line on the
                bill.
              </li>
            </ul>
          )}
        </section>
      )}
      {sources.length > 0 && (
        <Group foot="Only interest the statement charges that is not listed above. Until you type the Total yourself, it goes up with the interest.">
          <AmountField
            label={logged.length ? 'More interest (optional)' : 'Interest (optional)'}
            value={interest}
            currency={account.currency_code}
            onChange={changeInterest}
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
        <div
          className="panel mx-4 mt-4 bg-white px-4 py-3 dark:bg-raised"
          role="status"
          aria-label="Statement check"
        >
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
            <Tag tone={gap === 0 ? 'ok' : 'pink'}>
              {gap === 0 ? 'match ✓' : gap > 0 ? `+${money(gap)} missing` : `${money(-gap)} over`}
            </Tag>
            <span>
              {gap === 0
                ? '✓ Matches the app'
                : gap > 0
                  ? `The statement asks ${money(gap)} more than the app has`
                  : `The app has ${money(-gap)} more than the statement`}
            </span>
          </p>
          <p className="num mt-1.5 text-[15px] text-muted">
            App {money(card.bill + (interest ?? 0))} · Statement {money(total!)}
          </p>
        </div>
      )}
      <Block>
        <Button large rounded disabled={Boolean(error)} onClick={save}>
          {error ?? 'Save statement'}
        </Button>
      </Block>
    </Sheet>
  );
}
