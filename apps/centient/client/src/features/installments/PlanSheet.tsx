// A plan: its slices, each riding one of the card's bills and paid when that bill is ("I paid it" on the card).
// Others' shares still get their own "Mark paid" (a transfer from their tab into the card) with optional proof,
// until friends on plans move to per-slice tabs. "Move to next bill" and removing the plan.
import { CheckCircle, Paperclip, Trash, X } from '@phosphor-icons/react';
import { Block, Button } from 'konsta/react';
import { useState } from 'react';
import type { Account } from '../../../../src/repos/accounts';
import { dayLabel, formatMoney } from '../../lib/format';
import { me } from '../../lib/state';
import { billMonth } from '../../models/dates';
import { ConfirmSheet } from '../../ui/ConfirmSheet';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { installmentApi, moveView, type Plan } from '../../models/installment';
import { persist } from '../../models/query';
import { attempt } from '../../lib/run';

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
  /** The move's confirm sheet: open once the server said what it would take back. */
  const [moving, setMoving] = useState<ReturnType<typeof moveView> | null>(null);
  if (!plan) return null;
  const today = me.value?.today ?? '';
  const cur = account.currency_code;
  const shared = plan.parties.length > 1;
  const askMove = () =>
    attempt(async () => {
      const { interest } = await installmentApi.nextBillPreview(plan.id);
      setMoving(moveView(plan, interest));
    });
  const move = async () => {
    setMoving(null);
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
      <Sheet open={!confirm && !moving} onClose={onClose} title={plan.name}>
        {/* At a glance: what is left, a pip per installment (filled = paid), and the next bill it rides. */}
        <div className="mx-4 my-4">
          <div className="num text-[28px] font-extrabold tracking-[-0.04em]">
            {formatMoney(plan.remaining, cur)}{' '}
            <span className="text-[17px] font-bold tracking-normal text-muted">left</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
            {plan.schedule.map(s => (
              <span
                key={s.no}
                className={`size-3.5 rounded-[2px] border-2 ${s.left === 0 ? 'border-miku bg-miku' : 'border-current opacity-40'}`}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[15px] font-semibold text-muted">
            {plan.paidCount} of {plan.installments} paid ·{' '}
            {formatMoney(plan.amountPerInstallment, cur)} a month
          </div>
          {shared && (
            <div className="mt-1 text-[14px] text-muted">
              {plan.parties.map(x => `${x.name} ${formatMoney(x.share, cur)}`).join(' · ')} each
              installment
            </div>
          )}
        </div>
        {plan.next && (
          <section
            className="panel mx-4 mb-4 rounded-2xl bg-white px-4 py-3 dark:bg-raised"
            aria-label="Next installment"
          >
            <div className="flex items-baseline gap-3">
              <span className="text-[13px] font-bold tracking-[0.08em] text-muted">NEXT</span>
              <span className="flex-1 text-[19px] font-extrabold">
                {billMonth(plan.next.bill).toUpperCase()} bill
              </span>
              <span className="num text-[19px] font-extrabold">
                {formatMoney(plan.next.left, cur)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2 text-[14px] text-muted">
              <span>Not on this bill?</span>
              <button
                type="button"
                className="keycap keycap-quiet !rounded-[3px] !text-[12px]"
                aria-label="Move to next bill"
                onClick={askMove}
              >
                MOVE ▸
              </button>
            </div>
          </section>
        )}
        <div className="mx-4 flex flex-col gap-3">
          {shared &&
            plan.schedule.map(s => {
              const overdue = s.left > 0 && s.due < today;
              return (
                <div
                  key={s.no}
                  className={`panel rounded-2xl bg-white p-3.5 dark:bg-raised ${s.left === 0 ? 'opacity-70' : ''}`}
                  data-installment={s.no}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-bold">
                      Installment {s.no} of {plan.installments} · {billMonth(s.bill)} bill
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
                  {shared &&
                    s.shares.map(x => (
                      <ShareRow
                        key={x.seq}
                        plan={plan}
                        no={s.no}
                        sliceLeft={s.left}
                        share={x}
                        currency={cur}
                      />
                    ))}
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
        open={Boolean(moving)}
        message={moving?.words ?? ''}
        confirmLabel="MOVE"
        onCancel={() => setMoving(null)}
        onConfirm={move}
      >
        {moving && (
          <div className="c-msg text-center">
            <p className="num text-[30px] font-extrabold tracking-[0.04em]">
              {moving.from} → {moving.to}
            </p>
            <p className="mt-1">
              {moving.left === 1 ? 'The installment left moves' : `All ${moving.left} left move`}{' '}
              one bill on
            </p>
            {moving.interest.map(i => (
              <p key={i.on} className="mt-1">
                +{formatMoney(i.amount, cur)} interest back in {i.on}
              </p>
            ))}
          </div>
        )}
      </ConfirmSheet>
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

type Share = Plan['schedule'][number]['shares'][number];

/**
 * One person's share of one slice. Yours rides the card bill (no key); another person's gets Mark paid / Undo
 * (a transfer from their tab) and an optional proof.
 */
function ShareRow({
  plan,
  no,
  sliceLeft,
  share: x,
  currency: cur,
}: {
  plan: Plan;
  no: number;
  sliceLeft: number;
  share: Share;
  currency: string;
}) {
  const who = plan.parties.find(p => p.seq === x.seq)!;
  const whose = who.seq === 0 ? 'your' : `${who.name}'s`;
  const slot = { id: plan.id, no, seq: x.seq };
  const pay = async () => {
    if (await persist(() => installmentApi.pay(slot))) showToast('Marked paid');
  };
  const undo = async () => {
    if (await persist(() => installmentApi.unpay(slot))) showToast('Marked unpaid');
  };
  const attach = async (file: File) => {
    if (await persist(() => installmentApi.attachProof(slot, file))) showToast('Proof attached');
  };
  const unattach = () => persist(() => installmentApi.removeProof(slot));
  return (
    <div className="border-t border-edge py-2 first-of-type:border-t-0" data-party={who.name}>
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-raised-2 text-[13px] font-bold"
          aria-hidden="true"
        >
          {who.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{who.name}</span>
          <span className="block text-[13px] text-muted num">{formatMoney(x.amount, cur)}</span>
        </span>
        {who.seq === 0 ? (
          <span className="text-[13px] font-semibold text-muted">
            {sliceLeft === 0 ? 'Paid' : 'On the card bill'}
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
              onClick={undo}
              aria-label={`Mark ${whose} share of installment ${no} unpaid`}
            >
              Undo
            </Button>
          </>
        ) : (
          <Button
            small
            rounded
            inline
            onClick={pay}
            aria-label={`Mark ${whose} share of installment ${no} paid`}
          >
            Mark paid
          </Button>
        )}
      </div>
      {x.paid && (
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
                onClick={unattach}
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
                aria-label={`Attach proof for ${who.name}, installment ${no}`}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) attach(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
