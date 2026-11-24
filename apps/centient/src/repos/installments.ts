// Installment plans on pay later / credit card accounts, with who owes what and which shares are paid, and the
// interest lines posted for their slices.
import { all } from './sql';

export type PlanRow = {
  id: string;
  account_id: string;
  name: string;
  amount_per_installment: number;
  installments: number;
  first_due: string;
  /** The installment `first_due` belongs to (1 until the due dates are moved). Used only on a card without bill days. */
  anchor_no: number;
  created_at: string;
  /** What the limit blocks: the price, without interest. */
  price: number;
  bought_on: string;
  /** YYYY-MM: the bill slice 1 rides on (src/domain/cardBill.ts). */
  first_bill: string;
  paid_before: number;
  purchase_entry_id: string | null;
};
/** A posted interest line (`plan_interest`); `day` and `amount` are null once its entry was deleted. */
export type InterestRow = {
  plan_id: string;
  slice_no: number;
  entry_id: string;
  account_id: string | null;
  day: string | null;
  amount: number | null;
};

const LIVE_PURCHASE =
  '(purchase_entry_id IS NULL OR purchase_entry_id IN (SELECT id FROM entry_groups WHERE deleted_at IS NULL))';
const PLAN_COLUMNS =
  'id, account_id, name, amount_per_installment, installments, first_due, anchor_no, created_at, price, bought_on, first_bill, paid_before, purchase_entry_id';
export type PartyRow = {
  plan_id: string;
  seq: number;
  name: string;
  iou_account_id: string | null;
  share: number;
};
export type PaymentRow = {
  plan_id: string;
  installment_no: number;
  party_seq: number;
  paid_at: string;
  entry_id: string | null;
  proof: { id: string; filename: string; content_type: string } | null;
};

export function installmentsRepo(db: D1Database) {
  const owned =
    'plan_id IN (SELECT id FROM installment_plans WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL)';

  return {
    /** The statements that write a plan, its parties and the installments already paid; the caller batches them. */
    planInserts(
      ws: string,
      p: Omit<PlanRow, 'created_at' | 'anchor_no'> & { anchor_no: number },
      parties: PartyRow[],
      prepaid: Omit<PaymentRow, 'proof'>[],
    ): D1PreparedStatement[] {
      return [
        db
          .prepare(
            'INSERT INTO installment_plans (id, workspace_id, account_id, name, amount_per_installment, installments, first_due, anchor_no, price, bought_on, first_bill, paid_before, purchase_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            p.id,
            ws,
            p.account_id,
            p.name,
            p.amount_per_installment,
            p.installments,
            p.first_due,
            p.anchor_no,
            p.price,
            p.bought_on,
            p.first_bill,
            p.paid_before,
            p.purchase_entry_id,
          ),
        ...parties.map(x =>
          db
            .prepare(
              'INSERT INTO installment_parties (plan_id, seq, name, iou_account_id, share) VALUES (?, ?, ?, ?, ?)',
            )
            .bind(p.id, x.seq, x.name, x.iou_account_id, x.share),
        ),
        ...prepaid.map(x =>
          db
            .prepare(
              'INSERT INTO installment_payments (plan_id, installment_no, party_seq, paid_at, entry_id) VALUES (?, ?, ?, ?, ?)',
            )
            .bind(p.id, x.installment_no, x.party_seq, x.paid_at, x.entry_id),
        ),
      ];
    },

    /**
     * Live plans (optionally of one account) with their parties and paid shares. A share whose logged entry was
     * deleted counts as unpaid; a plan whose logged purchase was deleted is gone with it.
     */
    async listPlans(ws: string, accountId?: string) {
      const live = `workspace_id = ? AND deleted_at IS NULL AND (? IS NULL OR account_id = ?) AND ${LIVE_PURCHASE}`;
      const ids = `SELECT id FROM installment_plans WHERE ${live}`;
      const a = [ws, accountId ?? null, accountId ?? null];
      const [plans, parties, payments] = await db.batch<Record<string, unknown>>([
        db
          .prepare(
            `SELECT ${PLAN_COLUMNS} FROM installment_plans WHERE ${live} ORDER BY first_bill, created_at`,
          )
          .bind(...a),
        db
          .prepare(
            `SELECT plan_id, seq, name, iou_account_id, share FROM installment_parties WHERE plan_id IN (${ids}) ORDER BY plan_id, seq`,
          )
          .bind(...a),
        // A share stays paid only while its logged entry exists: deleting the transfer un-pays it.
        db
          .prepare(
            `SELECT p.plan_id, p.installment_no, p.party_seq, p.paid_at, p.entry_id, f.id AS proof_id, f.filename AS proof_filename, f.content_type AS proof_type
          FROM installment_payments p LEFT JOIN entry_groups g ON g.id = p.entry_id LEFT JOIN attachments f ON f.id = p.proof_id
          WHERE p.plan_id IN (${ids}) AND (p.entry_id IS NULL OR g.deleted_at IS NULL)`,
          )
          .bind(...a),
      ]);
      return {
        plans: plans.results as PlanRow[],
        parties: parties.results as PartyRow[],
        payments: payments.results.map((r): PaymentRow => ({
          plan_id: r.plan_id as string,
          installment_no: r.installment_no as number,
          party_seq: r.party_seq as number,
          paid_at: r.paid_at as string,
          entry_id: r.entry_id as string | null,
          proof: r.proof_id
            ? {
                id: r.proof_id as string,
                filename: r.proof_filename as string,
                content_type: r.proof_type as string,
              }
            : null,
        })),
      };
    },

    async addPayment(ws: string, p: Omit<PaymentRow, 'proof'>) {
      // A row left behind by a deleted entry is replaced, so the share can be paid again.
      const r = await db
        .prepare(
          `INSERT INTO installment_payments (plan_id, installment_no, party_seq, paid_at, entry_id)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM installment_plans WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL)
        ON CONFLICT (plan_id, installment_no, party_seq) DO UPDATE SET paid_at = excluded.paid_at, entry_id = excluded.entry_id, proof_id = NULL
        WHERE installment_payments.entry_id IS NOT NULL AND (SELECT deleted_at FROM entry_groups WHERE id = installment_payments.entry_id) IS NOT NULL`,
        )
        .bind(p.plan_id, p.installment_no, p.party_seq, p.paid_at, p.entry_id, p.plan_id, ws)
        .run();
      if (!r.meta.changes) throw new Error('ALREADY_PAID');
    },

    /** Removes a paid share; returns its logged entry id (or null), or undefined when there was none. */
    async deletePayment(ws: string, planId: string, no: number, seq: number) {
      const row = await db
        .prepare(
          `SELECT entry_id FROM installment_payments WHERE ${owned} AND installment_no = ? AND party_seq = ?`,
        )
        .bind(planId, ws, no, seq)
        .first<{ entry_id: string | null }>();
      if (!row) return undefined;
      await db
        .prepare(
          `DELETE FROM installment_payments WHERE ${owned} AND installment_no = ? AND party_seq = ?`,
        )
        .bind(planId, ws, no, seq)
        .run();
      return row.entry_id;
    },

    async setProof(
      ws: string,
      planId: string,
      no: number,
      seq: number,
      attachmentId: string | null,
    ) {
      const r = await db
        .prepare(
          `UPDATE installment_payments SET proof_id = ? WHERE ${owned} AND installment_no = ? AND party_seq = ?`,
        )
        .bind(attachmentId, planId, ws, no, seq)
        .run();
      return r.meta.changes > 0;
    },

    /** Slice 1 rides bill `month` (YYYY-MM): "Move to next bill". */
    async setFirstBill(ws: string, id: string, month: string) {
      await db
        .prepare(
          'UPDATE installment_plans SET first_bill = ? WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
        )
        .bind(month, id, ws)
        .run();
    },

    /** Every interest line ever posted for the workspace's live plans, with its entry's day and amount while it lives. */
    interest(ws: string) {
      return all<InterestRow>(
        db,
        `SELECT i.plan_id, i.slice_no, i.entry_id, e.account_id, substr(t.occurred_at, 1, 10) AS day, -e.amount AS amount
        FROM plan_interest i
        JOIN installment_plans p ON p.id = i.plan_id AND p.deleted_at IS NULL
        LEFT JOIN transactions t ON t.group_id = i.entry_id AND t.deleted_at IS NULL
        LEFT JOIN entries e ON e.transaction_id = t.id AND e.account_id = p.account_id
        WHERE i.workspace_id = ?`,
        ws,
      );
    },

    /** Interest typed by hand on a card bill (`card_interest`), live entries only, with where it came from. */
    handInterest(ws: string) {
      return all<{
        entry_id: string;
        account_id: string;
        day: string;
        amount: number;
        from_month: string | null;
        plan_id: string | null;
      }>(
        db,
        `SELECT i.entry_id, e.account_id, substr(t.occurred_at, 1, 10) AS day, -e.amount AS amount, i.from_month, i.plan_id
        FROM card_interest i
        JOIN transactions t ON t.group_id = i.entry_id AND t.deleted_at IS NULL
        JOIN entries e ON e.transaction_id = t.id AND e.amount < 0
        WHERE i.workspace_id = ?`,
        ws,
      );
    },

    /** Tags a hand-typed interest entry; batched with the entry. */
    handInterestInsert(ws: string, entryId: string, from: { month: string } | { planId: string }) {
      return db
        .prepare(
          'INSERT INTO card_interest (entry_id, workspace_id, from_month, plan_id) VALUES (?, ?, ?, ?)',
        )
        .bind(
          entryId,
          ws,
          'month' in from ? from.month : null,
          'planId' in from ? from.planId : null,
        );
    },

    /** Marks slice `no`'s interest posted as `entryId`; batched with the entry, a second post fails the batch. */
    interestInsert(ws: string, planId: string, no: number, entryId: string) {
      return db
        .prepare(
          'INSERT INTO plan_interest (workspace_id, plan_id, slice_no, entry_id) VALUES (?, ?, ?, ?)',
        )
        .bind(ws, planId, no, entryId);
    },

    /** Forgets slice `no`'s posted interest so it can be posted again (its entry is removed by the caller). */
    interestDelete(ws: string, planId: string, no: number) {
      return db
        .prepare(
          'DELETE FROM plan_interest WHERE workspace_id = ? AND plan_id = ? AND slice_no = ?',
        )
        .bind(ws, planId, no);
    },

    /** Workspaces with a live plan that charges interest: the ones the daily job looks at. */
    async withInterest() {
      const r = await all<{ workspace_id: string }>(
        db,
        'SELECT DISTINCT workspace_id FROM installment_plans WHERE deleted_at IS NULL AND price < amount_per_installment * installments',
      );
      return r.map(x => x.workspace_id);
    },

    async deletePlan(ws: string, id: string) {
      const r = await db
        .prepare(
          "UPDATE installment_plans SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL",
        )
        .bind(id, ws)
        .run();
      return r.meta.changes > 0;
    },
  };
}
