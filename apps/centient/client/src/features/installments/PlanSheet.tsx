// A plan: one "Mark paid" per person per installment (each logs that person's share as a transfer into the
// account), optional proof of payment on shared plans, and removing the plan.
import { CheckCircle, Paperclip, Trash, X } from '@phosphor-icons/react';
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { PlanView } from '../../../../src/application/installments';
import type { Account } from '../../../../src/application/ports';
import { call, client } from '../../lib/api';
import { dayLabel, formatMoney } from '../../lib/format';
import { attempt } from '../../lib/run';
import { everyday, me, refresh } from '../../lib/state';
import { load, save } from '../../lib/storage';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { PickerRow } from '../../ui/Fields';
import { Group } from '../../ui/List';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';

export function PlanSheet({ plan, account, onClose }: { plan: PlanView | null; account: Account; onClose: () => void }) {
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
