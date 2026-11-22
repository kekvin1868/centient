// A plan: its slices, each riding one of the card's bills and paid when that bill is ("I paid it" on the card).
// Others' shares still get their own "Mark paid" (a transfer from their tab into the card) with optional proof,
// until friends on plans move to per-slice tabs. "Move to next bill" and removing the plan.
import { CheckCircle, Paperclip, Trash, X } from '@phosphor-icons/react';
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import { dayLabel, formatMoney } from '../../lib/format';
import { me } from '../../lib/state';
import { billMonth } from '../../models/recurring';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { installmentApi, type Plan } from '../../models/installment';
import { persist } from '../../models/query';

export function PlanSheet({
  plan,
  account,
  onClose,
}: {
  plan: Plan | null;
  account: Account;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!plan) return null;
  const today = me.value?.today ?? '';
  const cur = account.currency_code;
  const shared = plan.parties.length > 1;
  const slot = (no: number, seq: number) => ({ id: plan.id, no, seq });
  const pay = async (no: number, seq: number) => {
    if (await persist(() => installmentApi.pay(slot(no, seq)))) showToast('Marked paid');
  };
  const undo = async (no: number, seq: number) => {
    if (await persist(() => installmentApi.unpay(slot(no, seq)))) showToast('Marked unpaid');
  };
  const attach = async (no: number, seq: number, file: File) => {
    if (await persist(() => installmentApi.attachProof(slot(no, seq), file)))
      showToast('Proof attached');
  };
  const unattach = (no: number, seq: number) =>
    persist(() => installmentApi.removeProof(slot(no, seq)));
  const move = async () => {
    if (await persist(() => installmentApi.nextBill(plan.id))) showToast('Moved to the next bill');
  };
  const remove = async () => {
    setConfirm(false);
    if (!(await persist(() => installmentApi.remove(plan.id)))) return;
    onClose();
    showToast('Plan removed. Its payments stay in your activity.');
  };

  return (
    <>
      <Sheet open={!confirm} onClose={onClose} title={plan.name}>
        <div className="mx-4 my-4">
          <div className="text-[15px] font-semibold text-muted">
            {plan.paidCount} of {plan.installments} paid ·{' '}
            {formatMoney(plan.amountPerInstallment, cur)} a month
          </div>
          <div className="mt-1 text-[28px] font-extrabold tracking-[-0.04em] num">
            {formatMoney(plan.remaining, cur)}{' '}
            <span className="text-[17px] font-bold text-muted tracking-normal">left</span>
          </div>
          <div className="mt-2 text-[14px] text-muted">
            {plan.parties.map(x => `${x.name} ${formatMoney(x.share, cur)}`).join(' · ')} each
            installment
          </div>
        </div>
        {plan.next && (
          <Block className="!my-3">
            <Button large rounded tonal onClick={move}>
              Move to next bill
            </Button>
            <p className="mt-2 text-[13px] text-muted">
              If {account.name}'s bill didn't have it yet, every installment moves one bill on.
            </p>
          </Block>
        )}
        <p className="mx-4 mb-3 text-[13px] text-muted">
          Each slice rides {account.name}'s bill. It is paid when you pay that bill.
        </p>
        <div className="mx-4 flex flex-col gap-3">
          {plan.schedule.map(s => {
            const overdue = s.left > 0 && s.due < today;
            return (
              <div
                key={s.no}
                className={`panel rounded-2xl bg-white p-3.5 dark:bg-raised ${s.left === 0 ? 'opacity-70' : ''}`}
                data-installment={s.no}
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">
                    Slice {s.no} · {billMonth(s.bill)} bill
                  </span>
                  <span
                    className={`text-[13px] font-semibold ${overdue ? 'text-negative' : 'text-muted'}`}
                  >
                    {s.left === 0
                      ? 'Paid'
                      : `${overdue ? 'Overdue · ' : ''}${dayLabel(s.due, today)}`}
                  </span>
                </div>
                {!shared && (
                  <span className="text-[13px] text-muted num">
                    {formatMoney(plan.amountPerInstallment, cur)}
                  </span>
                )}
                {(shared ? s.shares : []).map(x => {
                  const who = plan.parties.find(p => p.seq === x.seq)!;
                  const whose = who.seq === 0 ? 'your' : `${who.name}'s`;
                  return (
                    <div
                      key={x.seq}
                      className="border-t border-edge py-2 first-of-type:border-t-0"
                      data-party={who.name}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-full bg-raised-2 text-[13px] font-bold"
                          aria-hidden="true"
                        >
                          {who.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">
                            {who.name}
                          </span>
                          <span className="block text-[13px] text-muted num">
                            {formatMoney(x.amount, cur)}
                          </span>
                        </span>
                        {who.seq === 0 ? (
                          <span className="text-[13px] font-semibold text-muted">
                            {s.left === 0 ? 'Paid' : 'On the card bill'}
                          </span>
                        ) : x.paid ? (
                          <>
                            <span className="flex items-center gap-1 text-[13px] font-bold text-primary">
                              <CheckCircle size={18} weight="fill" aria-hidden="true" />
                              Paid
                            </span>
                            <Button
                              clear
                              inline
                              small
                              onClick={() => undo(s.no, x.seq)}
                              aria-label={`Mark ${whose} share of installment ${s.no} unpaid`}
                            >
                              Undo
                            </Button>
                          </>
                        ) : (
                          <Button
                            small
                            rounded
                            inline
                            onClick={() => pay(s.no, x.seq)}
                            aria-label={`Mark ${whose} share of installment ${s.no} paid`}
                          >
                            Mark paid
                          </Button>
                        )}
                      </div>
                      {shared && x.paid && (
                        <div className="mt-1.5 pl-[42px]">
                          {x.paid.proof ? (
                            <span className="flex items-center gap-1.5 text-[13px]">
                              <Paperclip size={14} weight="bold" aria-hidden="true" />
                              <a
                                className="min-w-0 truncate font-semibold text-primary underline-offset-2 hover:underline"
                                href={`/api/files/${x.paid.proof.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {x.paid.proof.filename}
                              </a>
                              <button
                                type="button"
                                className="grid size-7 place-items-center rounded-full active:opacity-60"
                                onClick={() => unattach(s.no, x.seq)}
                                aria-label="Remove proof"
                              >
                                <X size={14} weight="bold" />
                              </button>
                            </span>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-primary active:opacity-70">
                              <Paperclip size={14} weight="bold" aria-hidden="true" />
                              Attach proof (optional)
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/gif,application/pdf"
                                className="sr-only"
                                aria-label={`Attach proof for ${who.name}, installment ${s.no}`}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) attach(s.no, x.seq, f);
                                  e.target.value = '';
                                }}
                              />
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
        <Block>
          <Button
            large
            rounded
            tonal
            className="k-color-brand-red"
            onClick={() => setConfirm(true)}
          >
            <Trash size={18} weight="bold" className="mr-2" aria-hidden="true" />
            Remove plan
          </Button>
        </Block>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        message={`Remove ${plan.name}? Payments you marked stay in your activity.`}
        confirmLabel="Remove plan"
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    </>
  );
}
