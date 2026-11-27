// A quick-add card's plan ("12x"): the pips under its line, and the two questions a plan can ask ("Pay later or
// card?", "Each month?"). Downloaded the first time a "12x" card shows, not with Home's first paint; the card
// shows its "12× · Rp…/mo" line meanwhile.
import { Button, List } from 'konsta/react';
import { useState } from 'react';
import { isCard } from '../../../../src/domain/recurring';
import { everyday } from '../../lib/state';
import { AmountField } from '../../ui/AmountField';
import type { PlanForm } from './planForm';

/** One pip per installment, like the plan sheet's. */
export function Pips({ count }: { count: number }) {
  return (
    <span
      role="img"
      aria-label={`${count} installments`}
      className="mt-1 flex max-w-[180px] flex-wrap gap-[3px]"
    >
      {Array.from({ length: count }, (_, n) => (
        <span key={n} className="size-[7px] rounded-[1px] border border-current opacity-50" />
      ))}
    </span>
  );
}

/** "Pay later or card?": the cards and pay laters to pick from. */
export function PickCard({ onPick }: { onPick: (accountId: string) => void }) {
  return everyday()
    .filter(a => isCard(a.kind))
    .map(a => (
      <Button key={a.id} small rounded inline tonal onClick={() => onPick(a.id)}>
        {a.name}
      </Button>
    ));
}

/** "Each month?": what quick add read after the count, to confirm. */
export function AskEach({ plan, onOk }: { plan: PlanForm; onOk: (each: number) => void }) {
  const [each, setEach] = useState<number | null>(plan.each);
  return (
    <div className="flex w-full items-end gap-2">
      <List strong inset className="!m-0 flex-1">
        <AmountField label="Each month" value={each} onChange={setEach} />
      </List>
      <Button rounded inline disabled={!each} onClick={() => each && onOk(each)}>
        OK
      </Button>
    </div>
  );
}
