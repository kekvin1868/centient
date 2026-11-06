// The full entry form, as a receipt: Spent / Received / Moved, used by chips, Edit, and "+ Add manually".
// The title (where / from whom) is typed like a typewriter; every other detail is a receipt line you tap to
// change; the pocket is picked up front as stamps (Main pressed by default); the amount is the TOTAL.
import { Minus, Plus, X } from '@phosphor-icons/react';
import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { amountInput, showAmount } from '../../lib/amount';
import { formatMoney } from '../../lib/format';
import { pocketColor } from '../../lib/pocketColors';
import { active, catalog, everyday } from '../../lib/state';
import { DatePicker } from '../../ui/DatePicker';
import { LineSelect, Receipt, ReceiptLine, Rule } from '../../ui/Receipt';
import { useSumInput } from '../../ui/useSumInput';
import { Segmented } from '../../ui/Segmented';
import { Typewriter } from '../../ui/Typewriter';
import type { EntryType, Form } from './form';
import { splitView, withPeople, type Mode } from './shares';
import { withMyPotShare, withPot } from './form';

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'EXPENSE', label: 'Spent' },
  { value: 'INCOME', label: 'Received' },
  { value: 'TRANSFER', label: 'Moved' },
];
const HEAD: Record<EntryType, string> = {
  EXPENSE: 'SPENT',
  INCOME: 'RECEIVED',
  TRANSFER: 'MOVED',
  ALLOCATE: 'MOVED',
};
const MODES: { value: Mode; label: string }[] = [
  { value: 'SPLIT', label: 'Others pay the rest' },
  { value: 'COVER', label: 'I cover the rest' },
  { value: 'LATER', label: 'Pays the rest later' },
];
const dateLabel = (d: string) =>
  d
    ? new Date(`${d}T00:00:00Z`)
        .toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
        .toUpperCase()
    : 'PICK A DATE';

/** `lockType`: editing (the server keeps an entry's type), so the switch is hidden and the receipt is stamped. */
export function EntryForm({
  form,
  onChange,
  lockType,
}: {
  form: Form;
  onChange: (f: Form) => void;
  lockType?: boolean;
}) {
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const [dateOpen, setDateOpen] = useState(false);
  const dateLine = useRef<HTMLButtonElement>(null);
  const closeDate = () => {
    setDateOpen(false);
    dateLine.current?.focus();
  };
  const [more, setMore] = useState(
    Boolean(form.note || form.pot || (form.split && form.split > 1)),
  );
  const cat = catalog.value;
  const name = (rows: { id: string; name: string }[], id: string | null) =>
    rows.find(r => r.id === id)?.name;
  const accounts = everyday().map(a => ({ value: a.id, label: a.name }));
  const allAccounts = active(cat.accounts).map(a => ({ value: a.id, label: a.name }));
  const account = cat.accounts.find(a => a.id === form.accountId);
  const currency = account?.currency_code ?? 'IDR';
  // Covering a gap or taking money back only moves the bill's own currency.
  const sameCurrency = everyday()
    .filter(a => a.currency_code === currency)
    .map(a => ({ value: a.id, label: a.name }));
  // A new bill account drops the people's picked accounts: they may be in the old currency.
  const setAccount = (patch: Partial<Form>) =>
    set({ ...patch, parties: form.parties.map(p => ({ ...p, accountId: null })) });
  const categories = active(cat.categories)
    .filter(
      c => c.kind === form.type && c.name !== 'Balance adjustment' && c.name !== 'Opening balance',
    )
    .map(c => ({ value: c.id, label: c.name }));
  // Pockets of the chosen account only (a pocket belongs to one account); none picked = where its new money goes.
  const pockets = active(cat.envelopes).filter(e => e.account_id === form.accountId);
  const pocket = form.envelopeId ?? account?.default_envelope_id ?? null;
  // Names to suggest for a split: the people tabs, without the "Friends" lump or a currency suffix ("Andi (USD)").
  const tabNames = [
    ...new Set(
      active(cat.accounts)
        .filter(a => a.kind === 'IOU' && a.name.toLowerCase() !== 'friends')
        .map(a => a.name.replace(/ \([A-Z]{3,}\)$/, '')),
    ),
  ];
  const shares = splitView(form.amount, form.parties, form.myShare);
  const equalShare = form.amount && form.split ? Math.floor(form.amount / form.split) : 0;
  const anyFixed = form.myShare !== null || form.parties.some(p => p.share !== null);
  const money = form.type === 'EXPENSE' || form.type === 'INCOME';

  return (
    <>
      {form.type !== 'ALLOCATE' && !lockType && (
        <Segmented
          label="Type"
          value={form.type}
          options={TYPES}
          onChange={t =>
            set({
              type: t,
              categoryId: null,
              toAccountId: null,
              split: null,
              parties: [],
              myShare: null,
            })
          }
        />
      )}
      <Receipt stamp={lockType ? 'EDITING' : undefined}>
        <div className="grid gap-0.5 text-center text-[12px] tracking-[0.06em] text-[var(--paper-faint)]">
          <strong className="text-[13px] tracking-[0.3em] text-[var(--paper-ink)]">CENTIENT</strong>
          <span>
            {HEAD[form.type]} · {dateLabel(form.date)}
          </span>
        </div>
        <Rule />
        {money && (
          <Typewriter
            label={form.type === 'EXPENSE' ? 'What was it?' : 'Who paid you?'}
            value={form.merchant}
            placeholder={form.type === 'EXPENSE' ? 'Kopi Kenangan' : 'Salary'}
            onChange={merchant => set({ merchant })}
          />
        )}
        {form.type === 'TRANSFER' && (
          <>
            <ReceiptLine
              label="From"
              value={name(cat.accounts, form.accountId) ?? 'Pick one'}
              empty={!form.accountId}
              control={
                <LineSelect
                  label="From"
                  value={form.accountId}
                  options={allAccounts}
                  onChange={accountId => setAccount({ accountId })}
                />
              }
            />
            <ReceiptLine
              label="To"
              value={name(cat.accounts, form.toAccountId) ?? 'Pick one'}
              empty={!form.toAccountId}
              control={
                <LineSelect
                  label="To"
                  value={form.toAccountId}
                  options={allAccounts}
                  onChange={toAccountId => set({ toAccountId })}
                />
              }
            />
          </>
        )}
        <Rule />
        {money && (
          <>
            <ReceiptLine
              label="Category"
              value={name(cat.categories, form.categoryId) ?? 'Pick one'}
              empty={!form.categoryId}
              control={
                <LineSelect
                  label="Category"
                  value={form.categoryId}
                  options={categories}
                  onChange={categoryId => set({ categoryId })}
                />
              }
            />
            <ReceiptLine
              label={form.type === 'EXPENSE' ? 'Paid with' : 'Into'}
              value={account?.name ?? 'Pick one'}
              empty={!account}
              control={
                <LineSelect
                  label={form.type === 'EXPENSE' ? 'Paid with' : 'Into'}
                  value={form.accountId}
                  options={accounts}
                  onChange={accountId => setAccount({ accountId, envelopeId: null })}
                />
              }
            />
          </>
        )}
        {form.type === 'TRANSFER' && (
          <ReceiptLine
            label="Admin fee"
            value={form.fee ? formatMoney(form.fee) : 'None'}
            empty={!form.fee}
            control={
              <input
                aria-label="Admin fee"
                inputMode="numeric"
                value={showAmount(form.fee, 'IDR')}
                onChange={e =>
                  set({ fee: amountInput(e.target.value.replace(/\D/g, ''), 'IDR').minor })
                }
                className="absolute inset-0 w-full cursor-text opacity-0 [font-size:16px]"
              />
            }
          />
        )}
        <ReceiptLine
          label="Date"
          value={dateLabel(form.date)}
          control={
            <button
              ref={dateLine}
              type="button"
              aria-label={`Date, ${dateLabel(form.date)}`}
              aria-expanded={dateOpen}
              data-value={form.date}
              onClick={() => setDateOpen(o => !o)}
              className="absolute inset-0 w-full cursor-pointer"
            />
          }
        />
        {dateOpen && (
          <DatePicker
            label="Date"
            value={form.date}
            onPick={d => {
              set({ date: d });
              closeDate();
            }}
            onClose={closeDate}
          />
        )}
        {money && pockets.length > 0 && (
          <div
            className="pt-1.5"
            role="group"
            aria-label={form.type === 'EXPENSE' ? 'From pocket' : 'Into pocket'}
          >
            <span className="block text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
              {form.type === 'EXPENSE' ? 'From pocket' : 'Into pocket'}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {pockets.map((e, i) => {
                const isDefault = e.id === account?.default_envelope_id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={e.id === pocket}
                    onClick={() => set({ envelopeId: isDefault ? null : e.id })}
                    className="receipt-stamp-btn active:opacity-70"
                    style={
                      {
                        '--sc': `color-mix(in oklab, ${pocketColor(e.color, i, i === 0)} 60%, #0b0f10)`,
                      } as CSSProperties
                    }
                  >
                    {e.name.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {form.type !== 'ALLOCATE' && (
          <div className="mt-3">
            {!more && (
              <button
                type="button"
                onClick={() => setMore(true)}
                className="text-[12px] font-bold uppercase tracking-[0.1em] underline decoration-dotted underline-offset-4 active:opacity-70"
              >
                {form.type === 'EXPENSE' ? '+ Split or note' : '+ Note'}
              </button>
            )}
            {more && form.type === 'EXPENSE' && (
              <>
                <div className="flex gap-2 py-1" role="group" aria-label="Kind of split">
                  {(
                    [
                      [false, 'My Pot'],
                      [true, 'Joining a Pot'],
                    ] as const
                  ).map(([pot, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={Boolean(form.pot) === pot}
                      onClick={() =>
                        Boolean(form.pot) === pot
                          ? undefined
                          : pot
                            ? onChange(withPot({ ...form, amount: null }, {}))
                            : set({ pot: null, amount: null })
                      }
                      className="receipt-stamp-btn active:opacity-70"
                    >
                      {label.toUpperCase()}
                    </button>
                  ))}
                </div>
                {form.pot && (
                  <div className="pb-1" role="group" aria-label="The pot">
                    <label className="flex items-baseline gap-1.5 py-[5px]">
                      <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
                        Pot total
                      </span>
                      <input
                        aria-label="Pot total"
                        inputMode="decimal"
                        placeholder="0"
                        value={showAmount(form.pot.total, currency)}
                        onChange={e =>
                          onChange(
                            withPot(form, { total: amountInput(e.target.value, currency).minor }),
                          )
                        }
                        className="num min-w-0 flex-1 bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-[var(--paper-faint)] [font-size:16px]"
                      />
                    </label>
                    <div className="flex items-center gap-1.5 py-[5px]">
                      <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
                        Paying in
                      </span>
                      <span className="min-w-4 flex-1" aria-hidden="true" />
                      <Step
                        label="One person fewer in the pot"
                        onClick={() => onChange(withPot(form, { people: form.pot!.people - 1 }))}
                      >
                        <Minus size={12} weight="bold" />
                      </Step>
                      <span className="min-w-[4.5ch] text-center font-bold" aria-live="polite">
                        {form.pot.people} people
                      </span>
                      <Step
                        label="One person more in the pot"
                        onClick={() => onChange(withPot(form, { people: form.pot!.people + 1 }))}
                      >
                        <Plus size={12} weight="bold" />
                      </Step>
                    </div>
                    <label className="flex items-baseline gap-1.5 py-[5px]">
                      <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
                        Run by
                      </span>
                      <input
                        aria-label="Run by"
                        list="split-people"
                        value={form.pot.manager}
                        placeholder="optional"
                        onChange={e => onChange(withPot(form, { manager: e.target.value }))}
                        className="min-w-0 flex-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)] bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-[var(--paper-faint)] [font-size:16px]"
                      />
                      <datalist id="split-people">
                        {tabNames.map(n => (
                          <option key={n} value={n} />
                        ))}
                      </datalist>
                    </label>
                    {form.pot.typed && (
                      <button
                        type="button"
                        onClick={() => onChange(withMyPotShare(form, null))}
                        className="text-[12px] font-bold uppercase tracking-[0.1em] underline decoration-dotted underline-offset-4 active:opacity-70"
                      >
                        Equal share
                      </button>
                    )}
                  </div>
                )}
                {!form.pot && (
                  <>
                    <div className="flex items-center gap-1.5 py-[7px]">
                      <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
                        Split with
                      </span>
                      <span
                        className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)]"
                        aria-hidden="true"
                      />
                      <Step
                        label="One person fewer"
                        onClick={() => set(withPeople(form, (form.split ?? 1) - 1))}
                      >
                        <Minus size={12} weight="bold" />
                      </Step>
                      <span className="min-w-[4.5ch] text-center font-bold" aria-live="polite">
                        {(form.split ?? 1) === 1 ? 'Just me' : `${form.split} people`}
                      </span>
                      <Step
                        label="One person more"
                        onClick={() => set(withPeople(form, (form.split ?? 1) + 1))}
                      >
                        <Plus size={12} weight="bold" />
                      </Step>
                    </div>
                    {form.split && form.split > 1 && (
                      <div className="pb-1" role="group" aria-label="Who pays what">
                        <datalist id="split-people">
                          {tabNames.map(n => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                        <ShareRow
                          who={<span className="font-bold">You</span>}
                          value={shares.mine}
                          fixed={form.myShare !== null}
                          currency={currency}
                          label="Your share"
                          onChange={myShare => set({ myShare })}
                        />
                        {form.parties.map((p, i) => (
                          <Fragment key={i}>
                            <ShareRow
                              who={
                                <input
                                  aria-label={`Person ${i + 2} name`}
                                  list="split-people"
                                  value={p.name}
                                  placeholder={`Person ${i + 2}`}
                                  onChange={e =>
                                    set({
                                      parties: form.parties.map((x, j) =>
                                        j === i ? { ...x, name: e.target.value } : x,
                                      ),
                                    })
                                  }
                                  className="min-w-0 flex-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)] bg-transparent font-bold outline-none placeholder:font-normal placeholder:text-[var(--paper-faint)] [font-size:16px]"
                                />
                              }
                              value={p.share ?? shares.owes[i]}
                              fixed={p.share !== null}
                              currency={currency}
                              label={`${p.name || `Person ${i + 2}`}'s share`}
                              onChange={share =>
                                set({
                                  parties: form.parties.map((x, j) =>
                                    j === i ? { ...x, share } : x,
                                  ),
                                })
                              }
                              onRemove={() => {
                                const left = form.parties.filter((_, j) => j !== i);
                                set({ split: left.length ? left.length + 1 : null, parties: left });
                              }}
                            />
                            {p.share !== null && (p.mode !== 'SPLIT' || p.share < equalShare) && (
                              <>
                                <ReceiptLine
                                  label={`${p.name || `Person ${i + 2}`} is short`}
                                  value={MODES.find(m => m.value === p.mode)!.label}
                                  control={
                                    <LineSelect
                                      label={`${p.name || `Person ${i + 2}`} is short`}
                                      value={p.mode}
                                      options={MODES}
                                      onChange={mode =>
                                        set({
                                          parties: form.parties.map((x, j) =>
                                            // The account belongs to the old mode; editing hides the cover picker, so a stale one would
                                            // cut the bill with no cover entry saved.
                                            j === i
                                              ? { ...x, mode: mode as Mode, accountId: null }
                                              : x,
                                          ),
                                        })
                                      }
                                    />
                                  }
                                />
                                {p.mode !== 'SPLIT' && !(lockType && p.mode === 'COVER') && (
                                  <ReceiptLine
                                    label={
                                      p.mode === 'COVER' ? 'I cover it with' : 'They paid into'
                                    }
                                    value={
                                      name(cat.accounts, p.accountId ?? form.accountId) ??
                                      'Pick one'
                                    }
                                    control={
                                      <LineSelect
                                        label={
                                          p.mode === 'COVER' ? 'I cover it with' : 'They paid into'
                                        }
                                        value={p.accountId ?? form.accountId}
                                        options={sameCurrency}
                                        onChange={accountId =>
                                          set({
                                            parties: form.parties.map((x, j) =>
                                              j === i ? { ...x, accountId } : x,
                                            ),
                                          })
                                        }
                                      />
                                    }
                                  />
                                )}
                                {shares.covered[i] > 0 && (
                                  <p className="py-0.5 text-right text-[12px] text-[var(--paper-faint)]">
                                    You cover {formatMoney(shares.covered[i], currency)}
                                  </p>
                                )}
                                {shares.paidNow[i] > 0 && (
                                  <p className="py-0.5 text-right text-[12px] text-[var(--paper-faint)]">
                                    {formatMoney(shares.owes[i] - shares.paidNow[i], currency)}{' '}
                                    stays on {p.name || 'their'} tab
                                  </p>
                                )}
                              </>
                            )}
                          </Fragment>
                        ))}
                        {shares.problem && (
                          <p
                            role="alert"
                            className="py-1 text-right text-[12px] font-bold text-[#b3261e]"
                          >
                            {shares.problem === 'gap'
                              ? `${formatMoney(Math.abs(shares.gap), currency)} ${shares.gap > 0 ? 'not covered' : 'too much'}`
                              : shares.problem === 'over'
                                ? 'The amounts add up to more than the total'
                                : shares.problem === 'nothing'
                                  ? `${form.parties[shares.badIndex]?.name || `Person ${shares.badIndex + 2}`} pays their full share, nothing to cover`
                                  : shares.problem === 'name'
                                    ? 'Name the person who pays later'
                                    : 'Your share must be more than zero'}
                          </p>
                        )}
                        {anyFixed && (
                          <button
                            type="button"
                            onClick={() =>
                              set({
                                myShare: null,
                                parties: form.parties.map(p => ({
                                  ...p,
                                  share: null,
                                  mode: 'SPLIT' as const,
                                  accountId: null,
                                })),
                              })
                            }
                            className="text-[12px] font-bold uppercase tracking-[0.1em] underline decoration-dotted underline-offset-4 active:opacity-70"
                          >
                            Equal
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {more && (
              <label className="flex items-baseline gap-1.5 py-[7px]">
                <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">
                  Note
                </span>
                <input
                  value={form.note}
                  onChange={e => set({ note: e.target.value })}
                  placeholder="optional"
                  className="min-w-0 flex-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)] bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-[var(--paper-faint)] [font-size:16px]"
                />
              </label>
            )}
          </div>
        )}
        <Rule />
        {form.originalAmount !== null && form.originalCurrency && (
          <div className="mb-1 text-right text-[12px] text-[var(--paper-faint)]">
            PRICE WAS {formatMoney(form.originalAmount, form.originalCurrency)}
          </div>
        )}
        <Total
          label={form.pot ? 'YOUR SHARE' : 'TOTAL'}
          value={form.amount}
          currency={currency}
          onChange={amount => onChange(withMyPotShare(form, amount))}
        />
        <div className="mt-3 text-center text-[11px] tracking-[0.1em] text-[var(--paper-faint)]">
          THANK YOU
        </div>
      </Receipt>
    </>
  );
}

/** One person's line in a split: who, and their amount. Typing over the amount fixes it (bold); empty = equal again. */
function ShareRow({
  who,
  value,
  fixed,
  currency,
  label,
  onChange,
  onRemove,
}: {
  who: ReactNode;
  value: number;
  fixed: boolean;
  currency: string;
  label: string;
  onChange: (share: number | null) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-baseline gap-1.5 py-[5px]">
      {who}
      <input
        aria-label={label}
        inputMode="decimal"
        value={showAmount(value, currency)}
        onChange={e => onChange(amountInput(e.target.value, currency).minor)}
        className={`num w-[11ch] bg-transparent text-right outline-none [font-size:16px] ${fixed ? 'font-extrabold underline decoration-dotted' : 'font-normal text-[var(--paper-faint)]'}`}
      />
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label.replace(/'s share$/, '')}`}
          onClick={onRemove}
          className="grid size-5 shrink-0 place-items-center active:opacity-60"
        >
          <X size={12} weight="bold" />
        </button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md border-2 border-current active:opacity-60"
    >
      {children}
    </button>
  );
}

/** The TOTAL line: the amount, typed in place (sums too). */
function Total({
  label,
  value,
  currency,
  onChange,
}: {
  label: string;
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
}) {
  const { input, below, text } = useSumInput(value, currency, onChange);
  return (
    <div>
      <label className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-extrabold tracking-[0.2em]">{label}</span>
        <span className="flex min-w-0 items-baseline justify-end gap-1.5 text-[30px] font-extrabold tracking-[-0.02em]">
          <span className="text-[0.6em]">{currency === 'IDR' ? 'Rp' : currency}</span>
          <input
            aria-label="Amount"
            placeholder="0"
            {...input}
            style={{ width: `${Math.max(1, text.length) + 0.4}ch` }}
            className="num min-w-0 max-w-full bg-transparent text-right outline-none placeholder:text-[var(--paper-faint)] focus:underline focus:decoration-dotted focus:decoration-2"
          />
        </span>
      </label>
      <span className="block text-right">{below}</span>
    </div>
  );
}
