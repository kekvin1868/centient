// "Pay in" on the receipt, under PAID WITH when it is a card or pay later (UI grill 2026-11-26, option B): one joined
// bar of months, Full · 3 · 6 · 12 · 24 · ··· (any count 2–36 on a − + stepper). A count adds receipt lines with
// their dotted leaders: EACH MONTH (price ÷ count until typed), INTEREST / MONTH and TOTAL INTEREST (or INTEREST
// 0% · none), a ruled YOU PAY IN ALL, and ALREADY PAID when the date is old enough that some of the plan's bills
// have closed (logged late).
import { Minus, Plus } from '@phosphor-icons/react';
import { amountInput, showAmount } from '../../lib/amount';
import { formatMoney } from '../../lib/format';
import { ReceiptLine } from '../../ui/Receipt';
import { COUNTS, OTHER_START, eachOf, interestOf, type PlanForm } from './planForm';
import { billsGone } from './planDates';
import { billOf } from '../../../../src/domain/cardBill';
import { billMonth } from '../../models/dates';
import type { ReactNode } from 'react';

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

  const first = closes ? billMonth(billOf(date, closes)).toUpperCase() : null;
  const line = (label: string, value: ReactNode, tone?: string) => (
    <ReceiptLine
      label={label}
      value={<span style={tone ? { color: tone } : undefined}>{value}</span>}
    />
  );

  return (
    <>
      <div className="pt-2" role="group" aria-label="Pay in">
        <div className="flex items-baseline justify-between gap-3 text-[12px] tracking-[0.1em] text-[var(--paper-faint)]">
          <span className="uppercase">Pay in · months</span>
          <span>{plan ? (first ? `first on ${first} bill` : '') : 'paid at once'}</span>
        </div>
        {/* One joined bar of equal slots (no wrapping); MONTHS is said once, so the slots are bare numbers. */}
        <div className="mt-2 grid grid-cols-6 overflow-hidden rounded-[8px] border-2 border-[var(--paper-ink)]">
          <Slot on={!plan} label="Full" onClick={() => onChange(null)}>
            Full
          </Slot>
          {COUNTS.map(n => (
            <Slot key={n} on={plan?.count === n} label={`${n}×`} onClick={() => pick(n)}>
              {n}
            </Slot>
          ))}
          <Slot on={other} label="Other" last onClick={() => !other && pick(OTHER_START)}>
            {other ? plan.count : '···'}
          </Slot>
        </div>
        {other && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[13px] text-[var(--paper-faint)]">Any count, 2 to 36</span>
            <Stepper
              label="Installments"
              fewer="Fewer installments"
              more="More installments"
              value={plan.count}
              suffix="×"
              onChange={setCount}
            />
          </div>
        )}
      </div>
      {plan && (
        <div className="pt-1">
          <ReceiptLine
            label="Each month"
            value={each ? money(each) : '—'}
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
          {interest && interest.all > 0 ? (
            <>
              {line('Interest / month', `+${money(interest.month)}`, PINK)}
              {line('Total interest', `+${money(interest.all)}`, PINK)}
            </>
          ) : (
            line('Interest', '0% · none', GREEN)
          )}
          {each && (
            <div className="mt-1 border-t-2 border-[var(--paper-ink)] pt-1">
              {/* The price plus real interest: rounding price ÷ count up is not something you pay. */}
              <ReceiptLine label="You pay in all" value={money(amount! + (interest?.all ?? 0))} />
            </div>
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
        </div>
      )}
    </>
  );
}

/** Interest in the stamps' pink, a 0% plan in their green (the paper is light in both themes). */
const PINK = '#c2185b';
const GREEN = '#1d7a44';

/** One slot of the month bar: inked solid when picked. `label` = its name ("3×") where the slot shows "3". */
function Slot({
  on,
  label,
  last,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  last?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`num min-h-11 text-[15px] font-extrabold active:opacity-70 ${last ? '' : 'border-r-2 border-[var(--paper-ink)]'} ${on ? 'bg-[var(--paper-ink)] text-[var(--paper)]' : 'text-[var(--paper-ink)]'}`}
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
