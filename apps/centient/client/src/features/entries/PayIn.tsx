// "Pay in" on the receipt, under PAID WITH when it is a card or pay later: FULL / 3× / 6× / 12× / 24× stamps and
// OTHER (a − 18× + stepper for any count). A count adds EACH MONTH (price ÷ count until typed; more than that is
// interest, said per month and in all), and ALREADY PAID when the receipt's date is old enough that some of the
// plan's bills have closed (logged late). Same stamps and dotted lines as the rest of the receipt.
import { Minus, Plus } from '@phosphor-icons/react';
import { amountInput, showAmount } from '../../lib/amount';
import { formatMoney } from '../../lib/format';
import { ReceiptLine } from '../../ui/Receipt';
import { COUNTS, OTHER_START, eachOf, interestOf, type PlanForm } from './planForm';
import { billsGone } from './planDates';

const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export function PayIn({
  amount,
  date,
  closes,
  today,
  currency,
  plan,
  onChange,
}: {
  amount: number | null;
  date: string;
  closes: number | null;
  today: string;
  currency: string;
  plan: PlanForm | null;
  /** A new plan (null = in full); `paid` is worked out again by the form unless typed. */
  onChange: (plan: PlanForm | null) => void;
}) {
  const other = plan !== null && !COUNTS.includes(plan.count);
  const pick = (count: number) => onChange({ count, each: null, paid: 0 });
  const setCount = (count: number) =>
    plan && onChange({ ...plan, count: Math.min(36, Math.max(2, count)), each: null });
  const money = (n: number) => formatMoney(n, currency);
  const each = plan && amount ? eachOf(amount, plan) : null;
  const interest = plan && amount ? interestOf(amount, plan) : null;
  const gone = plan && closes ? billsGone(date, closes, today) : 0;

  return (
    <>
      <div className="pt-1.5">
        <span className="block text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
          Pay in
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Pay in">
          <Stamp on={!plan} onClick={() => onChange(null)}>
            Full
          </Stamp>
          {COUNTS.map(n => (
            <Stamp key={n} on={plan?.count === n} onClick={() => pick(n)}>
              {n}×
            </Stamp>
          ))}
          {other ? (
            <Stepper
              label="Installments"
              fewer="Fewer installments"
              more="More installments"
              value={plan.count}
              suffix="×"
              onChange={setCount}
            />
          ) : (
            <Stamp on={false} onClick={() => pick(OTHER_START)}>
              Other
            </Stamp>
          )}
        </div>
      </div>
      {plan && (
        <>
          <ReceiptLine
            label="Each month"
            value={each ? showAmount(each, currency) : '—'}
            control={
              <input
                aria-label="Each month"
                inputMode="numeric"
                value={showAmount(each, currency)}
                onChange={e =>
                  onChange({
                    ...plan,
                    each: amountInput(e.target.value.replace(/\D/g, ''), currency).minor,
                  })
                }
                className="absolute inset-0 w-full cursor-text opacity-0 [font-size:16px]"
              />
            }
          />
          {interest && interest.all > 0 && each && (
            <p className="grid pb-1 text-[13px] leading-snug text-[var(--paper-faint)]">
              <span>incl. {money(interest.month)} interest a month</span>
              <span className="num">
                {plan.count} × {money(each)} = {money(each * plan.count)}
              </span>
              <span className="font-bold text-[var(--paper-ink)]">
                {money(interest.all)} interest in all
              </span>
            </p>
          )}
          {(gone > 0 || plan.paid > 0) && (
            <div className="flex items-center gap-1.5 py-[7px]">
              <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
                Already paid
              </span>
              <span
                className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)]"
                aria-hidden="true"
              />
              <Stepper
                label="Already paid"
                fewer="Fewer already paid"
                more="More already paid"
                value={plan.paid}
                suffix={` of ${plan.count}`}
                min={0}
                max={plan.count - 1}
                onChange={paid => onChange({ ...plan, paid, paidTyped: true })}
              />
            </div>
          )}
          {gone > 0 && (
            <p className="pb-1 text-[13px] text-[var(--paper-faint)]">
              {gone} bill{gone === 1 ? '' : 's'} passed since {shortDay(date)}
            </p>
          )}
        </>
      )}
    </>
  );
}

function Stamp({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: string | string[] | (string | number)[];
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      // Picked = inked in solid, so the count reads at a glance; six fit one row on a phone.
      className={`receipt-stamp-btn !px-1.5 uppercase active:opacity-70 ${on ? '!bg-[var(--paper-ink)] !text-[var(--paper)] !border-[var(--paper-ink)]' : ''}`}
    >
      {children}
    </button>
  );
}

/** − n + on the receipt: a number typed or stepped, kept between `min` and `max`. */
function Stepper({
  label,
  fewer,
  more,
  value,
  suffix,
  min = 2,
  max = 36,
  onChange,
}: {
  label: string;
  fewer: string;
  more: string;
  value: number;
  suffix: string;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const key =
    'grid size-7 place-items-center rounded-[6px] border-2 border-current active:opacity-60';
  return (
    <span className="receipt-stamp-btn flex items-center gap-1.5 !px-1.5 text-[var(--paper-ink)]">
      <button
        type="button"
        aria-label={fewer}
        className={key}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus size={14} weight="bold" aria-hidden="true" />
      </button>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={e => e.target.value && onChange(clamp(Number(e.target.value)))}
        className="num w-8 bg-transparent text-center font-bold [appearance:textfield] [font-size:16px] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span aria-hidden="true" className="-ml-1 whitespace-nowrap font-bold">
        {suffix}
      </span>
      <button
        type="button"
        aria-label={more}
        className={key}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus size={14} weight="bold" aria-hidden="true" />
      </button>
    </span>
  );
}
