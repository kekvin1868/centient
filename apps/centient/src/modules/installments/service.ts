// Installment plans on pay later and credit card accounts: N equal monthly installments, each shared by
// one or more people. Every person's share of every installment is paid on its own, and paying it logs an
// ordinary transfer into the plan's account (yours from the account you pick, another person's from their
// IOU account), so balances stay right and the entry shows in activity. Deleting that entry un-pays the share.
import type { ServiceDeps } from '../../context';
import type { Command } from '../../lib/schemas';
import { jakartaToday, toOccurredAt } from '../../domain/cycle';
import { DomainError } from '../../domain/ledger';
import type { PartyRow, PaymentRow, PlanRow } from '../../repos/installments';
import type { LedgerService } from '../ledger/service';

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_TYPES = /^(image\/(png|jpeg|webp|heic|heif|gif)|application\/pdf)$/;

export type NewPlan = {
  accountId: string; name: string; amountPerInstallment: number; installments: number; firstDue: string;
  /** Installments already paid in full before the plan was added (the first ones). */
  paidCount: number;
  /** Your share of each installment; may be 0 when the plan is only other people's. */
  myShare: number;
  others: { name: string; iouAccountId?: string; share: number }[];
  /** true: the purchase is already in the account's balance (e.g. its opening balance); false: log it now. */
  alreadyInBalance: boolean;
  /** Spending category for your share when logging the purchase now. */
  categoryId?: string;
};

export type PlanView = ReturnType<typeof view>;

export function createInstallmentsService({ ws, now, repos, catalog, ledger }: ServiceDeps & { ledger: LedgerService }) {
  async function list(accountId?: string) {
    const { plans, parties, payments } = await repos.installments.listPlans(ws, accountId);
    const today = jakartaToday(now());
    return plans.map(p => view(p, parties, payments, today));
  }

  async function planOf(planId: string) {
    const plan = (await list()).find(p => p.id === planId);
    if (!plan) throw new DomainError('NOT_FOUND', 'Installment plan not found');
    return plan;
  }

  return {
    list,

    /**
     * Adds a plan. Each other person gets an IOU account (reused by name). What is still to pay is recorded so
     * their share sits on what they owe you: logging a new purchase splits it like a split bill (your part is
     * spending in `categoryId`, theirs a transfer to their IOU account); a purchase already in the balance only
     * moves their part onto their IOU account as a "Balance adjustment" that budgets ignore.
     * ponytail: plan rows and ledger entries are two writes, not one batch; a failure between them leaves the
     * entries without a plan (visible and deletable in activity). One batch needs a cross-repository write.
     */
    async create(i: NewPlan): Promise<PlanView> {
      const c = await catalog.load();
      const account = c.account(i.accountId).row;
      if (!['PAYLATER', 'CREDIT_CARD'].includes(account.kind)) throw new DomainError('NOT_INSTALLMENT_ACCOUNT', 'Installments go on a pay later or credit card account');
      if (i.paidCount < 0 || i.paidCount >= i.installments) throw new DomainError('PAID_COUNT', 'At least one installment must still be unpaid');
      if (i.myShare < 0 || i.others.some(o => o.share <= 0)) throw new DomainError('INVALID_SHARE', 'Every share must be more than zero');
      if (i.myShare + i.others.reduce((s, o) => s + o.share, 0) !== i.amountPerInstallment) {
        throw new DomainError('SHARES_DONT_ADD_UP', 'The shares must add up to the installment amount');
      }
      if (!i.myShare && !i.others.length) throw new DomainError('NO_PARTIES', 'Someone has to pay');
      const names = i.others.map(o => o.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) throw new DomainError('DUPLICATE_PARTY', 'Each person once');

      // Each other person owes through an IOU account: the one given, one with their name, or a new one.
      const ious: { name: string; id: string; share: number }[] = [];
      for (const o of i.others) {
        let id = o.iouAccountId;
        if (id) {
          if (c.account(id).row.kind !== 'IOU') throw new DomainError('NOT_IOU', 'A person must be an IOU account');
        } else {
          id = c.accounts.find(a => a.kind === 'IOU' && a.name.toLowerCase() === o.name.trim().toLowerCase())?.id
            ?? (await repos.accounts.create(ws, { name: o.name.trim(), kind: 'IOU', provider: null, currency_code: account.currency_code, due_day: null })).id;
        }
        ious.push({ name: o.name.trim(), id, share: o.share });
      }
      // The IOU accounts may be new, so the commands are checked against a fresh catalog.
      catalog.invalidate();

      const today = jakartaToday(now());
      const left = i.installments - i.paidCount;
      const note = `${i.name.trim()} · ${left} of ${i.installments} installments`;
      const cmds: Command[] = [];
      if (!i.alreadyInBalance) {
        if (i.myShare) {
          if (!i.categoryId) throw new DomainError('CATEGORY_REQUIRED', 'Pick a category for your share');
          cmds.push({ type: 'EXPENSE', accountId: account.id, categoryId: i.categoryId, amount: i.myShare * left, date: today, merchant: i.name.trim(), note });
        }
        for (const o of ious) cmds.push({ type: 'TRANSFER', fromAccountId: account.id, toAccountId: o.id, amount: o.share * left, date: today, note: `${o.name}'s share · ${note}` });
      } else if (ious.length) {
        const adj = c.categories.find(x => x.name === 'Balance adjustment' && x.kind === 'INCOME');
        if (!adj) throw new DomainError('NO_ADJUSTMENT_CATEGORY', 'Create a "Balance adjustment" income category first');
        for (const o of ious) cmds.push({ type: 'INCOME', accountId: o.id, categoryId: adj.id, amount: o.share * left, date: today, merchant: i.name.trim(), note: `${o.name}'s share · ${note}` });
      }
      if (cmds.length) await ledger.record(cmds);

      const id = crypto.randomUUID();
      const parties: PartyRow[] = [
        ...(i.myShare ? [{ plan_id: id, seq: 0, name: 'You', iou_account_id: null, share: i.myShare }] : []),
        ...ious.map((o, k) => ({ plan_id: id, seq: k + 1, name: o.name, iou_account_id: o.id, share: o.share })),
      ];
      const at = new Date(now()).toISOString();
      const prepaid = Array.from({ length: i.paidCount }, (_, k) => parties.map(x => ({ plan_id: id, installment_no: k + 1, party_seq: x.seq, paid_at: at, entry_id: null }))).flat();
      await repos.installments.createPlan(ws, { id, account_id: account.id, name: i.name.trim(), amount_per_installment: i.amountPerInstallment, installments: i.installments, first_due: i.firstDue }, parties, prepaid);
      return (await list(account.id)).find(p => p.id === id)!;
    },

    /**
     * Marks one person's share of one installment paid: logs a transfer of that share into the plan's account,
     * from `fromAccountId` for your share, from the person's IOU account for theirs.
     */
    async markPaid(planId: string, no: number, seq: number, i: { fromAccountId?: string; date?: string }) {
      const plan = await planOf(planId);
      const { share, party } = shareOf(plan, no, seq);
      if (share.paid) throw new DomainError('ALREADY_PAID', 'That share is already paid');
      const from = party.iouAccountId ?? i.fromAccountId;
      if (!from) throw new DomainError('FROM_REQUIRED', 'Pick the account you paid from');
      const c = await catalog.load();
      if (party.iouAccountId === null && ['IOU', 'PAYLATER', 'CREDIT_CARD'].includes(c.account(from).row.kind)) {
        throw new DomainError('FROM_ACCOUNT', 'Pay from a bank, e-wallet or cash account');
      }
      const date = i.date ?? jakartaToday(now());
      const who = party.seq === 0 ? 'Your' : `${party.name}'s`;
      const [entryId] = await ledger.record([{
        type: 'TRANSFER', fromAccountId: from, toAccountId: plan.accountId, amount: share.amount, date,
        note: `${who} share · ${plan.name} ${no}/${plan.installments}`,
      }]);
      try {
        await repos.installments.addPayment(ws, { plan_id: planId, installment_no: no, party_seq: seq, paid_at: toOccurredAt(date, now()), entry_id: entryId });
      } catch (e) {
        await repos.entries.remove(ws, entryId); // someone marked it at the same moment: keep one transfer
        throw e instanceof Error && e.message === 'ALREADY_PAID' ? new DomainError('ALREADY_PAID', 'That share is already paid') : e;
      }
      return planOf(planId);
    },

    /** Undoes a paid share: removes the mark and deletes its logged transfer (if any). */
    async unmarkPaid(planId: string, no: number, seq: number) {
      await planOf(planId);
      const entryId = await repos.installments.deletePayment(ws, planId, no, seq);
      if (entryId === undefined) throw new DomainError('NOT_PAID', 'That share is not marked paid');
      if (entryId) await repos.entries.remove(ws, entryId);
      return planOf(planId);
    },

    /** Proof of payment on a paid share. Only for plans shared by two or more people. */
    async attachProof(planId: string, no: number, seq: number, file: { name: string; type: string; bytes: ArrayBuffer }) {
      const plan = await planOf(planId);
      if (plan.parties.length < 2) throw new DomainError('PROOF_SHARED_ONLY', 'Proof of payment is for plans shared with someone');
      const { share } = shareOf(plan, no, seq);
      if (!share.paid) throw new DomainError('NOT_PAID', 'Mark the share paid first');
      if (!PROOF_TYPES.test(file.type)) throw new DomainError('FILE_TYPE', 'Use a photo (PNG, JPEG, WebP, HEIC) or a PDF');
      if (!file.bytes.byteLength || file.bytes.byteLength > MAX_PROOF_BYTES) throw new DomainError('FILE_SIZE', 'Files can be up to 10 MB');
      const id = crypto.randomUUID();
      const key = `${ws}/${id}`;
      await repos.files.put(key, file.bytes, file.type);
      await repos.files.create(ws, { id, r2_key: key, filename: file.name.slice(0, 120) || 'proof', content_type: file.type, size: file.bytes.byteLength });
      await repos.installments.setProof(ws, planId, no, seq, id);
      return planOf(planId);
    },

    async removeProof(planId: string, no: number, seq: number) {
      await planOf(planId);
      // ponytail: the file stays in R2 (unreferenced); a cleanup job can sweep orphans if storage ever matters.
      if (!(await repos.installments.setProof(ws, planId, no, seq, null))) throw new DomainError('NOT_PAID', 'That share is not marked paid');
      return planOf(planId);
    },

    async file(id: string) {
      const a = await repos.files.get(ws, id);
      const f = a && (await repos.files.read(a.r2_key));
      if (!a || !f) throw new DomainError('NOT_FOUND', 'File not found');
      return { ...f, filename: a.filename };
    },

    /** Deletes a plan; the entries it logged stay (they are real money movements). */
    async remove(id: string) {
      if (!(await repos.installments.deletePlan(ws, id))) throw new DomainError('NOT_FOUND', 'Installment plan not found');
    },
  };
}

/** The same day `k` months later, clamped to the month's length (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, k: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

function view(p: PlanRow, parties: PartyRow[], payments: PaymentRow[], today: string) {
  const own = parties.filter(x => x.plan_id === p.id);
  const paid = payments.filter(x => x.plan_id === p.id);
  const schedule = Array.from({ length: p.installments }, (_, i) => {
    const no = i + 1;
    const shares = own.map(x => {
      const pay = paid.find(y => y.installment_no === no && y.party_seq === x.seq);
      return { seq: x.seq, amount: x.share, paid: pay ? { at: pay.paid_at, entryId: pay.entry_id, proof: pay.proof } : null };
    });
    const left = shares.reduce((s, x) => s + (x.paid ? 0 : x.amount), 0);
    return { no, due: addMonths(p.first_due, i), shares, left };
  });
  const next = schedule.find(s => s.left > 0) ?? null;
  return {
    id: p.id, accountId: p.account_id, name: p.name, amountPerInstallment: p.amount_per_installment, installments: p.installments, firstDue: p.first_due,
    parties: own.map(x => ({ seq: x.seq, name: x.name, iouAccountId: x.iou_account_id, share: x.share })),
    schedule,
    paidCount: schedule.filter(s => s.left === 0).length,
    remaining: schedule.reduce((s, x) => s + x.left, 0),
    next: next ? { no: next.no, due: next.due, left: next.left, overdue: next.due < today } : null,
  };
}

function shareOf(plan: PlanView, no: number, seq: number) {
  const inst = plan.schedule.find(s => s.no === no);
  const share = inst?.shares.find(s => s.seq === seq);
  if (!inst || !share) throw new DomainError('NOT_FOUND', 'No such installment share');
  return { inst, share, party: plan.parties.find(p => p.seq === seq)! };
}
