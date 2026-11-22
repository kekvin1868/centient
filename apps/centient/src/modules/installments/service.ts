// Installment plans on pay later and credit card accounts: N equal monthly installments, each shared by
// one or more people. The price goes on the card at once (it blocks the limit) and each installment's slice
// rides one of the card's bills (src/domain/cardBill.ts); its interest is posted at that bill's closing by the
// daily job. A slice is paid when the card bill it rides is paid: your share has no pay key of its own. Another
// person's share is still marked paid on its own (a transfer from their IOU account into the card) until
// friends on plans move to per-slice tabs; deleting that entry un-pays the share.
import type { ServiceDeps } from '../../context';
import type { Repos } from '../../middleware/init';
import type { Command } from '../../lib/schemas';
import {
  cardBills,
  closingOf,
  firstBillFor,
  interestDue,
  principalOf,
  priceLeft,
  sliceBill,
  type BillPlan,
} from '../../domain/cardBill';
import { jakartaToday, toOccurredAt } from '../../domain/cycle';
import { DomainError } from '../../domain/ledger';
import { isCard, statementOf } from '../../domain/recurring';
import type { Account } from '../../repos/accounts';
import type { PartyRow, PaymentRow, PlanRow } from '../../repos/installments';
import type { LedgerService } from '../ledger/service';
import { findOrCreateTab } from '../ledger/tabs';
import { money } from '../../domain/reminders';

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_TYPES = /^(image\/(png|jpeg|webp|heic|heif|gif)|application\/pdf)$/;

export type NewPlan = {
  accountId: string;
  name: string;
  amountPerInstallment: number;
  installments: number;
  /** What the limit blocks, without interest; left out = no interest (amount × installments). */
  price?: number;
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

/** A plan as the bill math sees it. */
export const billPlan = (p: PlanRow): BillPlan => ({
  id: p.id,
  name: p.name,
  count: p.installments,
  each: p.amount_per_installment,
  price: p.price,
  boughtOn: p.bought_on,
  firstBill: p.first_bill,
  paidBefore: p.paid_before,
});

const cardDays = (a: Pick<Account, 'statement_day' | 'due_day'> | undefined) =>
  a?.statement_day ? { closes: a.statement_day, payBy: a.due_day } : null;

/**
 * Every set-up card's bills by `today` (src/domain/cardBill.ts), by account id: what the Bills page, the card's
 * statement and each plan's progress read. Plans of every card, posted interest and hand-typed interest in.
 */
export async function loadCardBills(repos: Repos, ws: string, accounts: Account[], today: string) {
  const [days, { plans }, posted, typed] = await Promise.all([
    repos.recurring.cardDays(ws),
    repos.installments.listPlans(ws),
    repos.installments.interest(ws),
    repos.installments.handInterest(ws),
  ]);
  const interest = [
    ...posted.flatMap(i =>
      i.account_id !== null && i.day !== null && i.amount !== null
        ? [
            {
              accountId: i.account_id,
              entryId: i.entry_id,
              planId: i.plan_id,
              no: i.slice_no,
              from: null,
              day: i.day,
              amount: i.amount,
            },
          ]
        : [],
    ),
    ...typed.map(i => ({
      accountId: i.account_id,
      entryId: i.entry_id,
      planId: i.plan_id,
      no: null,
      from: i.from_month,
      day: i.day,
      amount: i.amount,
    })),
  ];
  return new Map(
    accounts
      .filter(a => isCard(a.kind) && a.statement_day && !a.archived_at)
      .map(a => [
        a.id,
        cardBills(
          { closes: a.statement_day!, payBy: a.due_day },
          days.filter(d => d.account_id === a.id),
          plans.filter(p => p.account_id === a.id).map(billPlan),
          interest.filter(i => i.accountId === a.id).map(({ accountId: _, ...i }) => i),
          today,
        ),
      ]),
  );
}

export function createInstallmentsService({
  ws,
  now,
  repos,
  catalog,
  ledger,
}: ServiceDeps & { ledger: LedgerService }) {
  async function list(accountId?: string) {
    const [{ plans, parties, payments }, c] = await Promise.all([
      repos.installments.listPlans(ws, accountId),
      catalog.load(),
    ]);
    const today = jakartaToday(now());
    // Which slices the card bills paid: "planId:no".
    const bills = await loadCardBills(repos, ws, c.accounts, today);
    const paid = new Set(
      [...bills.values()].flatMap(r =>
        r.bills.flatMap(b => b.slices.filter(s => s.paid).map(s => `${s.planId}:${s.no}`)),
      ),
    );
    return plans.map(p =>
      view(
        p,
        parties,
        payments,
        today,
        cardDays(c.accounts.find(a => a.id === p.account_id)),
        paid,
      ),
    );
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
     * The entries and the plan rows are one atomic write. A new IOU account is written before them; if the
     * plan then fails it stays, empty, and is reused by name next time.
     */
    async create(i: NewPlan): Promise<PlanView> {
      const c = await catalog.load();
      const account = c.account(i.accountId).row;
      if (!isCard(account.kind))
        throw new DomainError(
          'NOT_INSTALLMENT_ACCOUNT',
          'Installments go on a pay later or credit card account',
        );
      const days = cardDays(account);
      if (!days)
        throw new DomainError('CARD_SETUP', `Set ${account.name}'s limit and bill days first`);
      const price = i.price ?? i.amountPerInstallment * i.installments;
      if (price <= 0 || price > i.amountPerInstallment * i.installments)
        throw new DomainError('PLAN_PRICE', 'The price is more than the installments add up to');
      if (i.paidCount < 0 || i.paidCount >= i.installments)
        throw new DomainError('PAID_COUNT', 'At least one installment must still be unpaid');
      if (i.myShare < 0 || i.others.some(o => o.share <= 0))
        throw new DomainError('INVALID_SHARE', 'Every share must be more than zero');
      if (i.myShare + i.others.reduce((s, o) => s + o.share, 0) !== i.amountPerInstallment) {
        throw new DomainError(
          'SHARES_DONT_ADD_UP',
          'The shares must add up to the installment amount',
        );
      }
      if (!i.myShare && !i.others.length) throw new DomainError('NO_PARTIES', 'Someone has to pay');
      const names = i.others.map(o => o.name.trim().toLowerCase());
      if (new Set(names).size !== names.length)
        throw new DomainError('DUPLICATE_PARTY', 'Each person once');

      // Each other person owes through an IOU account: the one given, one with their name, or a new one.
      const ious: { name: string; id: string; share: number }[] = [];
      for (const o of i.others) {
        let id = o.iouAccountId;
        if (id) {
          if (c.account(id).row.kind !== 'IOU')
            throw new DomainError('NOT_IOU', 'A person must be an IOU account');
        } else {
          id = await findOrCreateTab(repos, ws, c.accounts, o.name, account.currency_code);
        }
        ious.push({ name: o.name.trim(), id, share: o.share });
      }
      // The IOU accounts may be new, so the commands are checked against a fresh catalog.
      catalog.invalidate();

      const today = jakartaToday(now());
      const left = i.installments - i.paidCount;
      const note = `${i.name.trim()} · ${left} of ${i.installments} installments`;
      // The price still owed, shared out like the installment: each person's part of it, the last takes the
      // rounding. Without interest that is each share × the installments left.
      const owed = priceLeft({ price, count: i.installments, paidBefore: i.paidCount });
      const shares = [...(i.myShare ? [i.myShare] : []), ...ious.map(o => o.share)];
      const parts = shares.map(x => Math.round((x * owed) / i.amountPerInstallment));
      parts[parts.length - 1] += owed - parts.reduce((a, b) => a + b, 0);
      const myPart = i.myShare ? parts[0] : 0;
      const theirs = parts.slice(i.myShare ? 1 : 0);
      // Your part, told whole: "Rp703.332 over 3 installments · Rp234.444 a month in budgets".
      const mine = `${money(myPart, account.currency_code)} over ${left} installment${left === 1 ? '' : 's'} · ${money(Math.round(myPart / left), account.currency_code)} a month in budgets`;
      const cmds: Command[] = [];
      if (!i.alreadyInBalance) {
        if (myPart) {
          if (!i.categoryId)
            throw new DomainError('CATEGORY_REQUIRED', 'Pick a category for your share');
          cmds.push({
            type: 'EXPENSE',
            accountId: account.id,
            categoryId: i.categoryId,
            amount: myPart,
            date: today,
            merchant: i.name.trim(),
            note: `${i.name.trim()} · ${mine}`,
            spreadCycles: left,
          });
        }
        ious.forEach((o, k) =>
          cmds.push({
            type: 'TRANSFER',
            fromAccountId: account.id,
            toAccountId: o.id,
            amount: theirs[k],
            date: today,
            note: `${o.name}'s share · ${note}`,
          }),
        );
      } else if (ious.length) {
        const adj = c.categories.find(x => x.name === 'Balance adjustment' && x.kind === 'INCOME');
        if (!adj)
          throw new DomainError(
            'NO_ADJUSTMENT_CATEGORY',
            'Create a "Balance adjustment" income category first',
          );
        for (const o of ious)
          cmds.push({
            type: 'INCOME',
            accountId: o.id,
            categoryId: adj.id,
            amount: theirs[ious.indexOf(o)],
            date: today,
            merchant: i.name.trim(),
            note: `${o.name}'s share · ${note}`,
          });
      }
      const entries = cmds.length ? await ledger.prepare(cmds) : [];

      const id = crypto.randomUUID();
      const parties: PartyRow[] = [
        ...(i.myShare
          ? [{ plan_id: id, seq: 0, name: 'You', iou_account_id: null, share: i.myShare }]
          : []),
        ...ious.map((o, k) => ({
          plan_id: id,
          seq: k + 1,
          name: o.name,
          iou_account_id: o.id,
          share: o.share,
        })),
      ];
      const at = new Date(now()).toISOString();
      const prepaid = Array.from({ length: i.paidCount }, (_, k) =>
        parties.map(x => ({
          plan_id: id,
          installment_no: k + 1,
          party_seq: x.seq,
          paid_at: at,
          entry_id: null,
        })),
      ).flat();
      const written = repos.entries.insertStatements(ws, entries);
      // Slice paidCount + 1 rides the next bill; its due date also fills the old first_due column.
      const firstBill = firstBillFor(today, days.closes, i.paidCount);
      const firstDue = dueOf(firstBill, i.paidCount + 1, days) ?? today;
      await repos.batch([
        ...written.stmts,
        ...repos.installments.planInserts(
          ws,
          {
            id,
            account_id: account.id,
            name: i.name.trim(),
            amount_per_installment: i.amountPerInstallment,
            installments: i.installments,
            first_due: firstDue,
            anchor_no: i.paidCount + 1,
            price,
            bought_on: today,
            first_bill: firstBill,
            paid_before: i.paidCount,
            purchase_entry_id: i.alreadyInBalance ? null : (written.ids[0] ?? null),
          },
          parties,
          prepaid,
        ),
      ]);
      return (await list(account.id)).find(p => p.id === id)!;
    },

    /**
     * Marks another person's share of one installment paid: logs a transfer of that share from their IOU account
     * into the plan's account. Your own share is paid with the card bill ("I paid it"), never here.
     */
    async markPaid(planId: string, no: number, seq: number, i: { date?: string }) {
      const plan = await planOf(planId);
      const { share, party } = shareOf(plan, no, seq);
      const from = party.iouAccountId;
      if (!from) throw new DomainError('PAY_THE_BILL', 'Your share is paid with the card bill');
      if (share.paid) throw new DomainError('ALREADY_PAID', 'That share is already paid');
      const date = i.date ?? jakartaToday(now());
      const who = `${party.name}'s`;
      const [entryId] = await ledger.record([
        {
          type: 'TRANSFER',
          fromAccountId: from,
          toAccountId: plan.accountId,
          amount: share.amount,
          date,
          note: `${who} share · ${plan.name} ${no}/${plan.installments}`,
        },
      ]);
      try {
        await repos.installments.addPayment(ws, {
          plan_id: planId,
          installment_no: no,
          party_seq: seq,
          paid_at: toOccurredAt(date, now()),
          entry_id: entryId,
        });
      } catch (e) {
        await repos.entries.remove(ws, entryId); // someone marked it at the same moment: keep one transfer
        throw e instanceof Error && e.message === 'ALREADY_PAID'
          ? new DomainError('ALREADY_PAID', 'That share is already paid')
          : e;
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
    async attachProof(
      planId: string,
      no: number,
      seq: number,
      file: { name: string; type: string; bytes: ArrayBuffer },
    ) {
      const plan = await planOf(planId);
      if (plan.parties.length < 2)
        throw new DomainError(
          'PROOF_SHARED_ONLY',
          'Proof of payment is for plans shared with someone',
        );
      const { share } = shareOf(plan, no, seq);
      if (!share.paid) throw new DomainError('NOT_PAID', 'Mark the share paid first');
      if (!PROOF_TYPES.test(file.type))
        throw new DomainError('FILE_TYPE', 'Use a photo (PNG, JPEG, WebP, HEIC) or a PDF');
      if (!file.bytes.byteLength || file.bytes.byteLength > MAX_PROOF_BYTES)
        throw new DomainError('FILE_SIZE', 'Files can be up to 10 MB');
      const id = crypto.randomUUID();
      const key = `${ws}/${id}`;
      await repos.files.put(key, file.bytes, file.type);
      await repos.files.create(ws, {
        id,
        r2_key: key,
        filename: file.name.slice(0, 120) || 'proof',
        content_type: file.type,
        size: file.bytes.byteLength,
      });
      await repos.installments.setProof(ws, planId, no, seq, id);
      return planOf(planId);
    },

    async removeProof(planId: string, no: number, seq: number) {
      await planOf(planId);
      // ponytail: the file stays in R2 (unreferenced); a cleanup job can sweep orphans if storage ever matters.
      if (!(await repos.installments.setProof(ws, planId, no, seq, null)))
        throw new DomainError('NOT_PAID', 'That share is not marked paid');
      return planOf(planId);
    },

    async file(id: string) {
      const a = await repos.files.get(ws, id);
      const f = a && (await repos.files.read(a.r2_key));
      if (!a || !f) throw new DomainError('NOT_FOUND', 'File not found');
      return { ...f, filename: a.filename };
    },

    /**
     * "Move to next bill": the bank started the plan a bill later, so every slice moves one bill on. Only while its
     * first slice is on the last closed bill or a later one; interest posted for a slice whose bill has not closed
     * any more is taken back (the daily job posts it again when it does).
     */
    async nextBill(planId: string) {
      const [{ plans }, posted, c] = await Promise.all([
        repos.installments.listPlans(ws),
        repos.installments.interest(ws),
        catalog.load(),
      ]);
      const row = plans.find(p => p.id === planId);
      if (!row) throw new DomainError('NOT_FOUND', 'Installment plan not found');
      const days = cardDays(c.accounts.find(a => a.id === row.account_id));
      if (!days) throw new DomainError('CARD_SETUP', "Set the card's limit and bill days first");
      const today = jakartaToday(now());
      const plan = billPlan(row);
      const lastClosed = statementOf(days.closes, days.payBy, today).cutOff.slice(0, 7);
      if (sliceBill(plan, plan.paidBefore + 1) < lastClosed)
        throw new DomainError(
          'PLAN_STARTED',
          'Its slices are already on bills before the last one',
        );
      const moved = { ...plan, firstBill: sliceBill(plan, 2) };
      const undo = posted.filter(
        r => r.plan_id === planId && closingOf(sliceBill(moved, r.slice_no), days.closes) > today,
      );
      if (undo.length)
        await repos.batch(
          undo.flatMap(r => [
            ...repos.entries.removeStatements(ws, r.entry_id),
            repos.installments.interestDelete(ws, planId, r.slice_no),
          ]),
        );
      await repos.installments.setFirstBill(ws, planId, moved.firstBill);
      return planOf(planId);
    },

    /**
     * The daily job: posts each slice's interest as an expense on the card in Fees & Interests ("Interest · iPhone 3/12"),
     * dated on its bill's closing day, once its bill has closed. Catches up on days it missed. Returns how many.
     */
    async postInterest() {
      const today = jakartaToday(now());
      const [{ plans }, posted, c] = await Promise.all([
        repos.installments.listPlans(ws),
        repos.installments.interest(ws),
        catalog.load(),
      ]);
      const fees = c.categoryByName('Fees & Interests');
      if (!fees)
        throw new DomainError(
          'NO_FEES_CATEGORY',
          'Create a "Fees & Interests" expense category first',
        );
      let n = 0;
      for (const row of plans) {
        const days = cardDays(c.accounts.find(a => a.id === row.account_id));
        if (!days) continue;
        const done = new Set(posted.filter(r => r.plan_id === row.id).map(r => r.slice_no));
        for (const line of interestDue(billPlan(row), days.closes, today, done)) {
          const entries = await ledger.prepare([
            {
              type: 'EXPENSE',
              accountId: row.account_id,
              categoryId: fees.id,
              amount: line.amount,
              date: line.day,
              note: `Interest · ${row.name} ${line.no}/${row.installments}`,
            },
          ]);
          const { ids, stmts } = repos.entries.insertStatements(ws, entries);
          // One batch: if another run posted this slice first, the row clashes and nothing is written.
          await repos.batch([
            ...stmts,
            repos.installments.interestInsert(ws, row.id, line.no, ids[0]),
          ]);
          n++;
        }
      }
      return n;
    },

    /** Deletes a plan; the entries it logged stay (they are real money movements). */
    async remove(id: string) {
      if (!(await repos.installments.deletePlan(ws, id)))
        throw new DomainError('NOT_FOUND', 'Installment plan not found');
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

/** The day slice `no` is due: its bill's pay-by day (null when the card has no pay-by day). */
function dueOf(firstBill: string, no: number, days: { closes: number; payBy: number | null }) {
  const closing = closingOf(sliceBill({ firstBill }, no), days.closes);
  return statementOf(days.closes, days.payBy, closing).dueOn;
}

/**
 * A plan with its slices. A slice is paid when it was paid before the plan was added or the card bill it rides
 * covered it (`billPaid`, "planId:no"); `left` is the slice's share of the price still owed. Others' shares keep
 * their own paid marks (and proof) until friends on plans move to per-slice tabs.
 */
function view(
  p: PlanRow,
  parties: PartyRow[],
  payments: PaymentRow[],
  today: string,
  days: { closes: number; payBy: number | null } | null,
  billPaid: Set<string>,
) {
  const own = parties.filter(x => x.plan_id === p.id);
  const paid = payments.filter(x => x.plan_id === p.id);
  const schedule = Array.from({ length: p.installments }, (_, i) => {
    const no = i + 1;
    const shares = own.map(x => {
      const pay = paid.find(y => y.installment_no === no && y.party_seq === x.seq);
      return {
        seq: x.seq,
        amount: x.share,
        paid: pay ? { at: pay.paid_at, entryId: pay.entry_id, proof: pay.proof } : null,
      };
    });
    const done = no <= p.paid_before || billPaid.has(`${p.id}:${no}`);
    const left = done ? 0 : principalOf(p.price, p.installments, no);
    // A card without bill days (made before they were required) keeps the plan's own dates.
    const due = (days && dueOf(p.first_bill, no, days)) ?? addMonths(p.first_due, no - p.anchor_no);
    return { no, bill: sliceBill({ firstBill: p.first_bill }, no), due, shares, left };
  });
  const next = schedule.find(s => s.left > 0) ?? null;
  return {
    id: p.id,
    accountId: p.account_id,
    name: p.name,
    amountPerInstallment: p.amount_per_installment,
    installments: p.installments,
    price: p.price,
    firstBill: p.first_bill,
    parties: own.map(x => ({
      seq: x.seq,
      name: x.name,
      iouAccountId: x.iou_account_id,
      share: x.share,
    })),
    schedule,
    paidCount: schedule.filter(s => s.left === 0).length,
    remaining: schedule.reduce((s, x) => s + x.left, 0),
    next: next
      ? { no: next.no, bill: next.bill, due: next.due, left: next.left, overdue: next.due < today }
      : null,
  };
}

function shareOf(plan: PlanView, no: number, seq: number) {
  const inst = plan.schedule.find(s => s.no === no);
  const share = inst?.shares.find(s => s.seq === seq);
  if (!inst || !share) throw new DomainError('NOT_FOUND', 'No such installment share');
  return { inst, share, party: plan.parties.find(p => p.seq === seq)! };
}
