// Paying a bill from the Bills page in one tap: the PAID? key logs the expense today and moves the bill on, a
// toast offers Undo (which deletes that expense, so the bill is unpaid again), a bill that varies asks its
// amount first, and the payment that clears the month shows MONTH CLEAR. Paid rows carry a slanted PAID stamp.
import { Block, Button } from 'konsta/react';
import { useState, type ReactNode } from 'react';
import { formatMoney } from '../../lib/format';
import { buzz, reducedMotion } from '../../lib/motion';
import { monthRun, paidLate, type BillRow, type MonthRun } from '../../models/billRun';
import { persist, queryClient } from '../../models/query';
import { recurringApi, recurringQueries } from '../../models/recurring';
import { AmountField } from '../../ui/AmountField';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { MonthClear } from './MonthClear';

export function usePayBill(): { trail: (row: BillRow) => ReactNode; layers: ReactNode } {
  const [asking, setAsking] = useState<BillRow | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** The row paid a moment ago: its stamp slams down. */
  const [just, setJust] = useState<string | null>(null);
  const [clear, setClear] = useState<MonthRun[] | null>(null);

  const pay = async (row: BillRow, paying: number) => {
    const { item } = row;
    let entryId = '';
    setBusy(true);
    // Everything refreshes: the payment is an expense, so balances and budgets move too.
    const ok = await persist(async () => {
      ({ entryId } = await recurringApi.paid(item.id, { amount: paying }, row.due));
    });
    setBusy(false);
    if (!ok) return;
    setAsking(null);
    setJust(row.key);
    buzz();
    showToast(
      `${item.name} · ${formatMoney(paying, item.currency)} logged${row.state === 'late' ? ' · late' : ''}`,
      {
        action: {
          label: 'Undo',
          run: async () => {
            setClear(null);
            setJust(null);
            if (await persist(() => recurringApi.unpay(entryId)))
              showToast(`${item.name} is unpaid again`);
          },
        },
      },
    );
    const list = queryClient.getQueryData(recurringQueries.list().queryKey);
    const runs = list ? monthRun(list.items, list.today) : [];
    // After the stamp has landed.
    if (runs.length && runs.every(r => r.paid === r.count))
      setTimeout(() => setClear(runs), reducedMotion() ? 0 : 900);
  };

  const trail = (row: BillRow) => {
    const { item } = row;
    if (row.state === 'paid')
      return (
        <span
          className={`bill-stamp border-2 px-1 py-0.5 text-[12px] tracking-[0.08em] ${paidLate(row) ? 'border-pink text-negative' : 'border-current text-primary'} ${just === row.key ? 'bill-slam' : ''}`}
        >
          PAID
        </span>
      );
    // One key per bill: the due date it is on now.
    if (item.paused || row.due !== item.nextDue) return null;
    return (
      <button
        type="button"
        className="keycap !rounded-[3px] !text-[12px]"
        aria-label={`Mark ${item.name} paid`}
        disabled={busy}
        onClick={() => {
          if (item.amount !== null) return void pay(row, item.amount);
          setAmount(row.amount);
          setAsking(row);
        }}
      >
        PAID?
      </button>
    );
  };

  const layers = (
    <>
      {asking && (
        <Sheet
          key={`pay:${asking.key}`}
          open
          onClose={() => setAsking(null)}
          title={`${asking.item.name} this time`}
        >
          <Group foot="This bill varies. It is logged as an expense today.">
            <AmountField
              label="Amount paid"
              value={amount}
              currency={asking.item.currency}
              onChange={setAmount}
              autoFocus
            />
          </Group>
          <Block>
            <Button
              large
              rounded
              disabled={!amount || busy}
              onClick={() => amount && pay(asking, amount)}
            >
              {amount ? `Pay ${formatMoney(amount, asking.item.currency)}` : 'Enter what you paid'}
            </Button>
          </Block>
        </Sheet>
      )}
      <MonthClear runs={clear} onClose={() => setClear(null)} />
    </>
  );
  return { trail, layers };
}
