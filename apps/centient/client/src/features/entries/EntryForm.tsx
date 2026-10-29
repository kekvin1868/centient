// The full entry form, as a receipt: Spent / Received / Moved, used by chips, Edit, and "+ Add manually".
// The title (where / from whom) is typed like a typewriter; every other detail is a receipt line you tap to
// change; the pocket is picked up front as stamps (Main pressed by default); the amount is the TOTAL.
import { Minus, Plus } from '@phosphor-icons/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { amountInput, showAmount } from '../../lib/amount';
import { formatMoney } from '../../lib/format';
import { pocketColor } from '../../lib/pocketColors';
import { active, catalog, everyday } from '../../lib/state';
import { LineSelect, Receipt, ReceiptLine, Rule } from '../../ui/Receipt';
import { useSumInput } from '../../ui/useSumInput';
import { Segmented } from '../../ui/Segmented';
import { Typewriter } from '../../ui/Typewriter';
import type { EntryType, Form } from './form';

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'EXPENSE', label: 'Spent' }, { value: 'INCOME', label: 'Received' }, { value: 'TRANSFER', label: 'Moved' },
];
const HEAD: Record<EntryType, string> = { EXPENSE: 'SPENT', INCOME: 'RECEIVED', TRANSFER: 'MOVED', ALLOCATE: 'MOVED' };
const dateLabel = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase() : 'PICK A DATE');

/** `lockType`: editing (the server keeps an entry's type), so the switch is hidden and the receipt is stamped. */
export function EntryForm({ form, onChange, lockType }: { form: Form; onChange: (f: Form) => void; lockType?: boolean }) {
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const [more, setMore] = useState(Boolean(form.note || (form.split && form.split > 1)));
  const cat = catalog.value;
  const name = (rows: { id: string; name: string }[], id: string | null) => rows.find(r => r.id === id)?.name;
  const accounts = everyday().map(a => ({ value: a.id, label: a.name }));
  const allAccounts = active(cat.accounts).map(a => ({ value: a.id, label: a.name }));
  const account = cat.accounts.find(a => a.id === form.accountId);
  const currency = account?.currency_code ?? 'IDR';
  const categories = active(cat.categories).filter(c => c.kind === form.type && c.name !== 'Balance adjustment' && c.name !== 'Opening balance')
    .map(c => ({ value: c.id, label: c.name }));
  // Pockets of the chosen account only (a pocket belongs to one account); none picked = where its new money goes.
  const pockets = active(cat.envelopes).filter(e => e.account_id === form.accountId);
  const pocket = form.envelopeId ?? account?.default_envelope_id ?? null;
  const ious = active(cat.accounts).filter(a => a.kind === 'IOU').map(a => ({ value: a.id, label: a.name }));
  const money = form.type === 'EXPENSE' || form.type === 'INCOME';

  return (
    <>
      {form.type !== 'ALLOCATE' && !lockType && (
        <Segmented label="Type" value={form.type} options={TYPES}
          onChange={t => set({ type: t, categoryId: null, toAccountId: null, split: null })} />
      )}
      <Receipt stamp={lockType ? 'EDITING' : undefined}>
        <div className="grid gap-0.5 text-center text-[12px] tracking-[0.06em] text-[var(--paper-faint)]">
          <strong className="text-[13px] tracking-[0.3em] text-[var(--paper-ink)]">CENTIENT</strong>
          <span>{HEAD[form.type]} · {dateLabel(form.date)}</span>
        </div>
        <Rule />
        {money && (
          <Typewriter label={form.type === 'EXPENSE' ? 'What was it?' : 'Who paid you?'} value={form.merchant}
            placeholder={form.type === 'EXPENSE' ? 'Kopi Kenangan' : 'Salary'} onChange={merchant => set({ merchant })} />
        )}
        {form.type === 'TRANSFER' && (
          <>
            <ReceiptLine label="From" value={name(cat.accounts, form.accountId) ?? 'Pick one'} empty={!form.accountId}
              control={<LineSelect label="From" value={form.accountId} options={allAccounts} onChange={accountId => set({ accountId })} />} />
            <ReceiptLine label="To" value={name(cat.accounts, form.toAccountId) ?? 'Pick one'} empty={!form.toAccountId}
              control={<LineSelect label="To" value={form.toAccountId} options={allAccounts} onChange={toAccountId => set({ toAccountId })} />} />
          </>
        )}
        <Rule />
        {money && (
          <>
            <ReceiptLine label="Category" value={name(cat.categories, form.categoryId) ?? 'Pick one'} empty={!form.categoryId}
              control={<LineSelect label="Category" value={form.categoryId} options={categories} onChange={categoryId => set({ categoryId })} />} />
            <ReceiptLine label={form.type === 'EXPENSE' ? 'Paid with' : 'Into'} value={account?.name ?? 'Pick one'} empty={!account}
              control={<LineSelect label={form.type === 'EXPENSE' ? 'Paid with' : 'Into'} value={form.accountId} options={accounts} onChange={accountId => set({ accountId, envelopeId: null })} />} />
          </>
        )}
        {form.type === 'TRANSFER' && (
          <ReceiptLine label="Admin fee" value={form.fee ? formatMoney(form.fee) : 'None'} empty={!form.fee}
            control={<input aria-label="Admin fee" inputMode="numeric" value={showAmount(form.fee, 'IDR')} onChange={e => set({ fee: amountInput(e.target.value.replace(/\D/g, ''), 'IDR').minor })}
              className="absolute inset-0 w-full cursor-text opacity-0 [font-size:16px]" />} />
        )}
        <ReceiptLine label="Date" value={dateLabel(form.date)}
          control={<input type="date" aria-label="Date" value={form.date} onChange={e => set({ date: e.target.value })} className="absolute inset-0 w-full cursor-pointer opacity-0 [font-size:16px]" />} />
        {money && pockets.length > 0 && (
          <div className="pt-1.5" role="group" aria-label={form.type === 'EXPENSE' ? 'From pocket' : 'Into pocket'}>
            <span className="block text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">{form.type === 'EXPENSE' ? 'From pocket' : 'Into pocket'}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {pockets.map((e, i) => {
                const isDefault = e.id === account?.default_envelope_id;
                return (
                  <button key={e.id} type="button" aria-pressed={e.id === pocket} onClick={() => set({ envelopeId: isDefault ? null : e.id })}
                    className="receipt-stamp-btn active:opacity-70" style={{ '--sc': `color-mix(in oklab, ${pocketColor(e.color, i, i === 0)} 60%, #0b0f10)` } as CSSProperties}>
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
              <button type="button" onClick={() => setMore(true)} className="text-[12px] font-bold uppercase tracking-[0.1em] underline decoration-dotted underline-offset-4 active:opacity-70">{form.type === 'EXPENSE' ? '+ Split or note' : '+ Note'}</button>
            )}
            {more && form.type === 'EXPENSE' && (
              <>
                <div className="flex items-center gap-1.5 py-[7px]">
                  <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">Split with</span>
                  <span className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)]" aria-hidden="true" />
                  <Step label="One person fewer" onClick={() => { const n = Math.max(1, (form.split ?? 1) - 1); set({ split: n > 1 ? n : null, iouAccountId: n > 1 ? form.iouAccountId : null }); }}><Minus size={12} weight="bold" /></Step>
                  <span className="min-w-[4.5ch] text-center font-bold" aria-live="polite">{form.split ?? 1} {(form.split ?? 1) === 1 ? 'just you' : 'people'}</span>
                  <Step label="One person more" onClick={() => { const n = Math.min(50, (form.split ?? 1) + 1); set({ split: n, iouAccountId: form.iouAccountId ?? ious[0]?.value ?? null }); }}><Plus size={12} weight="bold" /></Step>
                </div>
                {form.split && form.split > 1 && ious.length > 1 && (
                  <ReceiptLine label="Who owes you" value={name(cat.accounts, form.iouAccountId) ?? 'Pick one'}
                    control={<LineSelect label="Who owes you" value={form.iouAccountId} options={ious} onChange={iouAccountId => set({ iouAccountId })} />} />
                )}
              </>
            )}
            {more && (
              <label className="flex items-baseline gap-1.5 py-[7px]">
                <span className="shrink-0 text-[12px] uppercase tracking-[0.1em] text-[var(--paper-faint)]">Note</span>
                <input value={form.note} onChange={e => set({ note: e.target.value })} placeholder="optional"
                  className="min-w-0 flex-1 border-b-2 border-dotted border-[color-mix(in_oklab,var(--paper-ink)_25%,transparent)] bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-[var(--paper-faint)] [font-size:16px]" />
              </label>
            )}
          </div>
        )}
        <Rule />
        {form.originalAmount !== null && form.originalCurrency && (
          <div className="mb-1 text-right text-[12px] text-[var(--paper-faint)]">PRICE WAS {formatMoney(form.originalAmount, form.originalCurrency)}</div>
        )}
        <Total value={form.amount} currency={currency} onChange={amount => set({ amount })} />
        <div className="mt-3 text-center text-[11px] tracking-[0.1em] text-[var(--paper-faint)]">THANK YOU</div>
      </Receipt>
    </>
  );
}

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className="grid size-7 place-items-center rounded-md border-2 border-current active:opacity-60">{children}</button>;
}

/** The TOTAL line: the amount, typed in place (sums too). */
function Total({ value, currency, onChange }: { value: number | null; currency: string; onChange: (minor: number | null) => void }) {
  const { input, below, text } = useSumInput(value, currency, onChange);
  return (
    <div>
      <label className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-extrabold tracking-[0.2em]">TOTAL</span>
        <span className="flex min-w-0 items-baseline justify-end gap-1.5 text-[30px] font-extrabold tracking-[-0.02em]">
          <span className="text-[0.6em]">{currency === 'IDR' ? 'Rp' : currency}</span>
          <input aria-label="Amount" placeholder="0" {...input}
            style={{ width: `${Math.max(1, text.length) + 0.4}ch` }}
            className="num min-w-0 max-w-full bg-transparent text-right outline-none placeholder:text-[var(--paper-faint)] focus:underline focus:decoration-dotted focus:decoration-2" />
        </span>
      </label>
      <span className="block text-right">{below}</span>
    </div>
  );
}
