// Installment plans on a pay later / credit card account: the list under the lifted card, a sheet per plan
// with one "Mark paid" per person per installment (each logs that person's share as a transfer into the
// account), optional proof of payment on shared plans, and the form to add a plan.
import { CheckCircle, ClockCountdown, Paperclip, Plus, Trash, X } from '@phosphor-icons/react';
import { Block, Button } from 'konsta/react';
import { useEffect, useState } from 'react';
import type { PlanView } from '../../../src/application/installments';
import type { Account } from '../../../src/application/ports';
import { call, client } from '../api';
import { dayLabel, formatMoney } from '../lib/format';
import { load, save } from '../lib/storage';
import { attempt } from '../lib/run';
import { active, catalog, everyday, me, refresh, version } from '../state';
import { AmountField } from './AmountField';
import { ConfirmSheet } from './ConfirmSheet';
import { InputRow, PickerRow, StepperRow, ToggleRow } from './Fields';
import { Group } from './List';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import { showToast } from './Toast';

export const takesInstallments = (kind: string) => kind === 'PAYLATER' || kind === 'CREDIT_CARD';
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Plans of every account (for Home's "due soon"), or of one account. Reloads after every write. */
export function usePlans(accountId?: string) {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  useEffect(() => {
    attempt(async () => setPlans((await call(client.api.installments.$get({ query: accountId ? { account: accountId } : {} }))).plans as PlanView[]));
  }, [accountId, version.value]);
  return plans;
}

/** The plans list under a lifted pay later / credit card card. */
export function InstallmentsSection({ account }: { account: Account }) {
  const plans = usePlans(account.id);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = plans?.find(p => p.id === open) ?? null;
  return (
    <section className="mt-5" aria-label="Installments">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Installments</h3>
        {plans && plans.length > 0 && <span className="text-[13px] font-semibold text-muted">{formatMoney(plans.reduce((s, p) => s + p.remaining, 0), account.currency_code)} to go</span>}
      </div>
      <div className="flex flex-col gap-2.5">
        {plans?.map(p => <PlanCard key={p.id} plan={p} currency={account.currency_code} onOpen={() => setOpen(p.id)} />)}
        {plans && !plans.length && <p className="text-[15px] text-muted">Paying something off in parts? Add it to see what's due and who has paid.</p>}
        <button type="button" onClick={() => setAdding(true)}
          className="panel flex h-12 items-center justify-center gap-2 rounded-2xl bg-raised text-[16px] font-bold active:opacity-80">
          <Plus size={18} weight="bold" aria-hidden="true" />Add installments
        </button>
      </div>
      <PlanSheet key={`plan:${shown?.id ?? 'none'}`} plan={shown} account={account} onClose={() => setOpen(null)} />
      <NewPlanSheet key={`new-plan:${adding}`} open={adding} account={account} onClose={() => setAdding(false)} />
    </section>
  );
}

function PlanCard({ plan: p, currency, onOpen }: { plan: PlanView; currency: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="panel flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left active:opacity-80 dark:bg-raised"
      aria-label={`${p.name}, ${p.paidCount} of ${p.installments} paid`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised-2" aria-hidden="true"><ClockCountdown size={20} weight="bold" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{p.name}</span>
        <span className={`block truncate text-[13px] ${p.next?.overdue ? 'font-semibold text-negative' : 'text-muted'}`}>
          {p.next ? `${formatMoney(p.next.left, currency)} ${p.next.overdue ? 'overdue since' : 'due'} ${shortDate(p.next.due)}` : 'All paid'}
          {p.parties.length > 1 ? ` · ${p.parties.length} people` : ''}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[12px] font-bold text-muted">{p.paidCount}/{p.installments}</span>
        {/* One pip per installment, filled when fully paid. */}
        <span className="flex gap-1" aria-hidden="true">
          {p.schedule.slice(0, 12).map(s => <span key={s.no} className={`h-2 w-2 rounded-[2px] ${s.left === 0 ? 'bg-miku' : 'bg-raised-2'}`} />)}
        </span>
      </span>
    </button>
  );
}

function PlanSheet({ plan, account, onClose }: { plan: PlanView | null; account: Account; onClose: () => void }) {
  const payers = everyday().filter(a => ['BANK', 'DEBIT_CARD', 'EWALLET', 'CASH'].includes(a.kind) && a.currency_code === account.currency_code);
  const [from, setFrom] = useState<string | null>(load<string | null>('payFrom', null) ?? payers[0]?.id ?? null);
  const [confirm, setConfirm] = useState(false);
  if (!plan) return null;
  const today = me.value?.today ?? '';
  const cur = account.currency_code;
  const shared = plan.parties.length > 1;
  const base = client.api.installments[':id'];
  const pay = (no: number, seq: number) => attempt(async () => {
    if (seq === 0 && !from) return showToast('Pick the account you paid from');
    if (seq === 0 && from) save('payFrom', from);
    await call(base.payments.$post({ param: { id: plan.id }, json: { no, seq, fromAccountId: seq === 0 ? from! : undefined } }));
    showToast('Marked paid');
    await refresh();
  });
  const undo = (no: number, seq: number) => attempt(async () => {
    await call(base.payments[':no'][':seq'].$delete({ param: { id: plan.id, no: String(no), seq: String(seq) } }));
    showToast('Marked unpaid');
    await refresh();
  });
  const attach = (no: number, seq: number, file: File) => attempt(async () => {
    await call(base.payments[':no'][':seq'].proof.$post({ param: { id: plan.id, no: String(no), seq: String(seq) }, form: { file } }));
    showToast('Proof attached');
    await refresh();
  });
  const unattach = (no: number, seq: number) => attempt(async () => {
    await call(base.payments[':no'][':seq'].proof.$delete({ param: { id: plan.id, no: String(no), seq: String(seq) } }));
    await refresh();
  });
  const remove = () => attempt(async () => {
    setConfirm(false);
    await call(base.$delete({ param: { id: plan.id } }));
    onClose();
    showToast('Plan removed. Its payments stay in your activity.');
    await refresh();
  });

  return (
    <>
      <Sheet open={!confirm} onClose={onClose} title={plan.name}>
        <div className="mx-4 my-4">
          <div className="text-[15px] font-semibold text-muted">{plan.paidCount} of {plan.installments} paid · {formatMoney(plan.amountPerInstallment, cur)} a month</div>
          <div className="mt-1 text-[28px] font-extrabold tracking-[-0.04em] num">{formatMoney(plan.remaining, cur)} <span className="text-[17px] font-bold text-muted tracking-normal">left</span></div>
          <div className="mt-2 text-[14px] text-muted">{plan.parties.map(x => `${x.name} ${formatMoney(x.share, cur)}`).join(' · ')} each installment</div>
        </div>
        {plan.parties.some(x => x.seq === 0) && (
          <Group foot="Your share is logged as a transfer from this account. Others' shares come off what they owe you.">
            <PickerRow label="You pay from" value={from} options={payers.map(a => ({ value: a.id, label: a.name }))} onChange={setFrom} />
          </Group>
        )}
        <div className="mx-4 flex flex-col gap-3">
          {plan.schedule.map(s => {
            const overdue = s.left > 0 && s.due < today;
            return (
              <div key={s.no} className={`panel rounded-2xl bg-white p-3.5 dark:bg-raised ${s.left === 0 ? 'opacity-70' : ''}`} data-installment={s.no}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">Installment {s.no}</span>
                  <span className={`text-[13px] font-semibold ${overdue ? 'text-negative' : 'text-muted'}`}>
                    {s.left === 0 ? 'Paid' : `${overdue ? 'Overdue · ' : ''}${dayLabel(s.due, today)}`}
                  </span>
                </div>
                {s.shares.map(x => {
                  const who = plan.parties.find(p => p.seq === x.seq)!;
                  const whose = who.seq === 0 ? 'your' : `${who.name}'s`;
                  return (
                    <div key={x.seq} className="border-t border-edge py-2 first-of-type:border-t-0" data-party={who.name}>
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-raised-2 text-[13px] font-bold" aria-hidden="true">{who.name.slice(0, 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{who.name}</span>
                          <span className="block text-[13px] text-muted num">{formatMoney(x.amount, cur)}</span>
                        </span>
                        {x.paid ? (
                          <>
                            <span className="flex items-center gap-1 text-[13px] font-bold text-primary"><CheckCircle size={18} weight="fill" aria-hidden="true" />Paid</span>
                            <Button clear inline small onClick={() => undo(s.no, x.seq)} aria-label={`Mark ${whose} share of installment ${s.no} unpaid`}>Undo</Button>
                          </>
                        ) : (
                          <Button small rounded inline onClick={() => pay(s.no, x.seq)} aria-label={`Mark ${whose} share of installment ${s.no} paid`}>Mark paid</Button>
                        )}
                      </div>
                      {shared && x.paid && (
                        <div className="mt-1.5 pl-[42px]">
                          {x.paid.proof ? (
                            <span className="flex items-center gap-1.5 text-[13px]">
                              <Paperclip size={14} weight="bold" aria-hidden="true" />
                              <a className="min-w-0 truncate font-semibold text-primary underline-offset-2 hover:underline" href={`/api/files/${x.paid.proof.id}`} target="_blank" rel="noreferrer">{x.paid.proof.filename}</a>
                              <button type="button" className="grid size-7 place-items-center rounded-full active:opacity-60" onClick={() => unattach(s.no, x.seq)} aria-label="Remove proof"><X size={14} weight="bold" /></button>
                            </span>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-primary active:opacity-70">
                              <Paperclip size={14} weight="bold" aria-hidden="true" />Attach proof (optional)
                              <input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/gif,application/pdf" className="sr-only"
                                aria-label={`Attach proof for ${who.name}, installment ${s.no}`}
                                onChange={e => { const f = e.target.files?.[0]; if (f) attach(s.no, x.seq, f); e.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <Block><Button large rounded tonal className="k-color-brand-red" onClick={() => setConfirm(true)}><Trash size={18} weight="bold" className="mr-2" aria-hidden="true" />Remove plan</Button></Block>
      </Sheet>
      <ConfirmSheet open={confirm} message={`Remove ${plan.name}? Payments you marked stay in your activity.`} confirmLabel="Remove plan"
        onCancel={() => setConfirm(false)} onConfirm={remove} />
    </>
  );
}

type Person = { key: number; name: string; share: number | null };

function NewPlanSheet({ open, account, onClose }: { open: boolean; account: Account; onClose: () => void }) {
  const today = me.value?.today ?? '';
  const cur = account.currency_code;
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [count, setCount] = useState(3);
  const [firstDue, setFirstDue] = useState(today);
  const [paidCount, setPaidCount] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [split, setSplit] = useState<'equal' | 'custom'>('equal');
  const [myShare, setMyShare] = useState<number | null>(null);
  const [inBalance, setInBalance] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Equal split: everyone pays a whole share; you take the rounding (as with split bills).
  const n = people.length + 1;
  const each = amount ? Math.floor(amount / n) : 0;
  const shares = split === 'equal'
    ? { mine: amount ? amount - each * people.length : 0, others: people.map(() => each) }
    : { mine: myShare ?? 0, others: people.map(p => p.share ?? 0) };
  const sum = shares.mine + shares.others.reduce((s, x) => s + x, 0);
  const error = !name.trim() ? 'Name what you bought' : !amount ? 'Enter the installment amount' : !firstDue ? 'Pick the first due date'
    : people.some(p => !p.name.trim()) ? 'Name each person' : split === 'custom' && sum !== amount ? `Shares add up to ${formatMoney(sum, cur)}, not ${formatMoney(amount, cur)}`
    : people.length && shares.others.some(x => x <= 0) ? 'Every share must be more than zero'
    : !inBalance && shares.mine > 0 && !categoryId ? 'Pick a category' : null;
  const iouNames = active(catalog.value.accounts).filter(a => a.kind === 'IOU').map(a => a.name);

  const save = async () => {
    if (error || !amount) return;
    setBusy(true);
    const ok = await attempt(() => call(client.api.installments.$post({
      json: {
        accountId: account.id, name: name.trim(), amountPerInstallment: amount, installments: count, firstDue, paidCount,
        myShare: shares.mine, others: people.map((p, k) => ({ name: p.name.trim(), share: shares.others[k] })),
        alreadyInBalance: inBalance, categoryId: !inBalance && categoryId ? categoryId : undefined,
      },
    })));
    setBusy(false);
    if (ok) { onClose(); showToast('Installments added'); await refresh(); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add installments">
      <Group>
        <InputRow label="What" value={name} placeholder="e.g. iPhone" onInput={setName} />
        <AmountField label="Each installment" value={amount} currency={cur} onChange={setAmount} />
        <StepperRow label="Installments" value={count} min={1} max={36} onChange={v => { setCount(v); if (paidCount >= v) setPaidCount(v - 1); }} />
        <InputRow label="First due" type="date" value={firstDue} onInput={setFirstDue} />
        <StepperRow label="Already paid" value={paidCount} min={0} max={count - 1} onChange={setPaidCount} />
      </Group>

      <Group label="Who pays" foot={people.length ? 'Each person marks their own share paid every month.' : 'Add the people you split this with, if any.'}>
        {split === 'custom' && <AmountField label="Your share" value={myShare} currency={cur} onChange={setMyShare} />}
        {people.flatMap((p, k) => [
          <InputRow key={`${p.key}:name`} label={`Person ${k + 1}`} value={p.name} placeholder={iouNames[k] ?? 'Name'} onInput={v => setPeople(people.map(x => (x.key === p.key ? { ...x, name: v } : x)))} />,
          split === 'custom' ? <AmountField key={`${p.key}:share`} label={`${p.name || 'Their'} share`} value={p.share} currency={cur} onChange={v => setPeople(people.map(x => (x.key === p.key ? { ...x, share: v } : x)))} /> : null,
          <li key={`${p.key}:remove`}>
            <button type="button" className="flex w-full items-center gap-1.5 px-4 py-2 text-[14px] font-semibold text-muted active:opacity-60" onClick={() => setPeople(people.filter(x => x.key !== p.key))}>
              <X size={14} weight="bold" aria-hidden="true" />Remove {p.name.trim() || `person ${k + 1}`}
            </button>
          </li>,
        ])}
        <li><button type="button" className="w-full px-4 py-3 text-left font-semibold text-primary active:opacity-70" onClick={() => setPeople([...people, { key: Date.now(), name: '', share: null }])}>+ Add a person</button></li>
      </Group>
      {people.length > 0 && (
        <>
          <Segmented label="Split" value={split} onChange={setSplit} options={[{ value: 'equal', label: 'Equally' }, { value: 'custom', label: 'Custom' }]} />
          {split === 'equal' && amount ? <p className="mx-5 -mt-2 mb-2 text-[14px] text-muted">{n} people · {formatMoney(each, cur)} each{shares.mine !== each ? ` (you ${formatMoney(shares.mine, cur)})` : ''}</p> : null}
        </>
      )}

      <Group foot={inBalance ? `Nothing new is added to ${account.name}'s balance.${people.length ? " Others' remaining shares are added to what they owe you." : ''}`
        : `Logs what's left as spending on ${account.name}${people.length ? ', with the others\' shares owed to you' : ''}.`}>
        <ToggleRow label={`Already in ${account.name}'s balance`} checked={inBalance} onChange={setInBalance} />
        {!inBalance && shares.mine > 0 && (
          <PickerRow label="Category" value={categoryId}
            options={active(catalog.value.categories).filter(c => c.kind === 'EXPENSE').map(c => ({ value: c.id, label: c.name }))} onChange={setCategoryId} />
        )}
      </Group>
      <Block><Button large rounded disabled={Boolean(error) || busy} onClick={save}>{error ?? (busy ? 'Adding…' : 'Add installments')}</Button></Block>
    </Sheet>
  );
}

/** The plans with something due within 3 days (or overdue), soonest first. */
export function dueSoon(plans: PlanView[], today: string) {
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
  return plans.filter(p => p.next && p.next.due <= soon).sort((a, b) => a.next!.due.localeCompare(b.next!.due));
}
