// The lifted card's details, under the cards: its free balance (the Main pocket, never named) as the hero with the
// account total under it when other pockets hold some, Update balance / Activity (a person's tab: Paid back, or when
// you owe them Returned + Kept until a day), then whatever the screen adds for this account (its pockets, its installments).
import { Button } from 'konsta/react';
import { useState, type ReactNode } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import type { Envelope } from '../../../../src/repos/envelopes';
import { formatMoney } from '../../lib/format';
import { idrValue, priceAge } from '../../lib/prices';
import { usePrices } from '../../models/price';
import { BigMoney } from '../../ui/BigMoney';
import { UpdateBalanceSheet } from './UpdateBalanceSheet';
import { isStandIn, me } from '../../lib/state';
import { accountApi } from '../../models/account';
import type { PayMode } from '../../models/payback';
import { persist } from '../../models/query';
import { dateText, DateRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { Block } from 'konsta/react';

type Bal = Account & { balance: number };

export function PickedAccount({
  account: a,
  pockets,
  onShow,
  onPay,
  children,
}: {
  account: Bal | null;
  pockets: (Envelope & { balance: number })[];
  onShow: (a: Account) => void;
  /** A person's tab: open Paid back / Return money (the sheet belongs to entries; the screen composes them). */
  onPay: (a: Account, mode: PayMode) => void;
  children?: ReactNode;
}) {
  const [updating, setUpdating] = useState<Bal | null>(null);
  const main = pockets.find(p => p.id === a?.default_envelope_id);
  const split = Boolean(main && pockets.some(p => p !== main && p.balance));
  const free = split ? main!.balance : (a?.balance ?? 0);
  const iou = a?.kind === 'IOU';
  const iouBelow = iou && free < 0;
  const [keeping, setKeeping] = useState(false);
  return (
    <div
      className="mt-4 grid px-4"
      style={{
        gridTemplateRows: a ? '1fr' : '0fr',
        transition: 'grid-template-rows 420ms cubic-bezier(.34,1.3,.64,1)',
      }}
    >
      <div className="overflow-hidden">
        {a ? (
          <div className="pb-2 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[22px] font-extrabold leading-none tracking-[-0.03em]">
                {a.name}
              </span>
              {a.reconciled_at && (
                <span className="shrink-0 text-[13px] text-muted">
                  Checked {a.reconciled_at.slice(0, 10)}
                </span>
              )}
            </div>
            {iouBelow && (
              <div className="mt-2 text-[15px] font-semibold text-muted">You owe {a.name}</div>
            )}
            <BigMoney
              minor={iouBelow ? -free : free}
              currency={a.currency_code}
              max={40}
              className={`mt-2 ${free < 0 && !iouBelow ? 'text-negative' : ''}`}
            />
            {split && (
              <div className="num mt-2 text-[14px] font-semibold text-muted">
                {formatMoney(a.balance, a.currency_code)} in total
              </div>
            )}
            {a.currency_code !== 'IDR' && <CryptoValue account={a} />}
            {isStandIn(a.id) ? (
              <p className="mt-4 text-[15px] text-muted" role="status">
                Waiting to send. {a.name} gets a tab, and Paid back, once the bill is sent.
              </p>
            ) : (
              <div className="mt-4 flex gap-3">
                {iou ? (
                  <Button
                    large
                    rounded
                    className="flex-1"
                    onClick={() => onPay(a, iouBelow ? 'RETURN' : 'PAID')}
                  >
                    {iouBelow ? 'Returned' : 'Paid back'}
                  </Button>
                ) : (
                  <Button large rounded className="flex-1" onClick={() => setUpdating(a)}>
                    Update balance
                  </Button>
                )}
                <Button large rounded tonal className="flex-1" onClick={() => onShow(a)}>
                  Activity
                </Button>
              </div>
            )}
            {iouBelow && (
              <div className="mt-3 flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[14px] text-muted">
                  {a.kept_until
                    ? `Kept · return by ${dateText(a.kept_until)}`
                    : 'Keeping it for now? Pick when you return it.'}
                </span>
                <button
                  type="button"
                  className="keycap keycap-quiet h-9 text-[14px]"
                  onClick={() => setKeeping(true)}
                >
                  {a.kept_until ? 'Change' : 'Kept'}
                </button>
              </div>
            )}
            {children}
          </div>
        ) : null}
      </div>
      <UpdateBalanceSheet
        key={`account:${updating?.id ?? 'none'}`}
        account={updating}
        onClose={() => setUpdating(null)}
      />
      {a && (
        <KeptSheet
          key={`kept:${a.id}:${keeping}`}
          open={keeping}
          account={a}
          onClose={() => setKeeping(false)}
        />
      )}
    </div>
  );
}

/** Kept: you hold what you owe this person until a day; Home's strip turns into a warning from that day. */
function KeptSheet({
  open,
  account: a,
  onClose,
}: {
  open: boolean;
  account: Bal;
  onClose: () => void;
}) {
  const [day, setDay] = useState(a.kept_until ?? me.value?.today ?? '');
  const save = async (kept_until: string | null) => {
    if (await persist(() => accountApi.update(a.id, { kept_until }))) {
      onClose();
      showToast(kept_until ? `Kept until ${dateText(kept_until)}` : 'Not kept');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Keep ${a.name}'s money`}>
      <Group foot="Home shows it as Kept until this day, then reminds you to return it.">
        <DateRow label="Return by" value={day} onChange={setDay} />
      </Group>
      <Block className="flex flex-col gap-2">
        <Button large rounded disabled={!day} onClick={() => save(day)}>
          Save
        </Button>
        {a.kept_until && (
          <Button large rounded tonal onClick={() => save(null)}>
            Not kept
          </Button>
        )}
      </Block>
    </Sheet>
  );
}

/** What a crypto balance is worth in rupiah, with how fresh the price is. */
function CryptoValue({ account: a }: { account: Bal }) {
  const p = usePrices();
  const v = idrValue(a.balance, a.currency_code, p);
  const age = priceAge(a.currency_code, p);
  if (v === null)
    return (
      <div className="mt-2 text-[14px] text-muted">
        No rupiah price for {a.currency_code}; it isn't in the total.
      </div>
    );
  return (
    <div
      className={`mt-2 text-[14px] font-semibold ${age?.stale ? 'text-negative' : 'text-muted'}`}
    >
      ≈ {formatMoney(v)} · {age?.stale ? 'last known price, ' : ''}
      {age?.label}
    </div>
  );
}
