// Installment plans on pay later / credit card accounts, with who owes what and which shares are paid.

export type PlanRow = {
  id: string; account_id: string; name: string; amount_per_installment: number; installments: number; first_due: string; created_at: string;
};
export type PartyRow = { plan_id: string; seq: number; name: string; iou_account_id: string | null; share: number };
export type PaymentRow = {
  plan_id: string; installment_no: number; party_seq: number; paid_at: string; entry_id: string | null;
  proof: { id: string; filename: string; content_type: string } | null;
};

export function installmentsRepo(db: D1Database) {
  const owned = 'plan_id IN (SELECT id FROM installment_plans WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL)';

  return {
    /** The statements that write a plan, its parties and the installments already paid; the caller batches them. */
    planInserts(ws: string, p: Omit<PlanRow, 'created_at'>, parties: PartyRow[], prepaid: Omit<PaymentRow, 'proof'>[]): D1PreparedStatement[] {
      return [
        db.prepare('INSERT INTO installment_plans (id, workspace_id, account_id, name, amount_per_installment, installments, first_due) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(p.id, ws, p.account_id, p.name, p.amount_per_installment, p.installments, p.first_due),
        ...parties.map(x => db.prepare('INSERT INTO installment_parties (plan_id, seq, name, iou_account_id, share) VALUES (?, ?, ?, ?, ?)')
          .bind(p.id, x.seq, x.name, x.iou_account_id, x.share)),
        ...prepaid.map(x => db.prepare('INSERT INTO installment_payments (plan_id, installment_no, party_seq, paid_at, entry_id) VALUES (?, ?, ?, ?, ?)')
          .bind(p.id, x.installment_no, x.party_seq, x.paid_at, x.entry_id)),
      ];
    },

    /** Live plans (optionally of one account) with their parties and paid shares. A share whose logged entry was deleted counts as unpaid. */
    async listPlans(ws: string, accountId?: string) {
      const live = 'workspace_id = ? AND deleted_at IS NULL AND (? IS NULL OR account_id = ?)';
      const ids = `SELECT id FROM installment_plans WHERE ${live}`;
      const a = [ws, accountId ?? null, accountId ?? null];
      const [plans, parties, payments] = await db.batch<Record<string, unknown>>([
        db.prepare(`SELECT id, account_id, name, amount_per_installment, installments, first_due, created_at FROM installment_plans WHERE ${live} ORDER BY first_due, created_at`).bind(...a),
        db.prepare(`SELECT plan_id, seq, name, iou_account_id, share FROM installment_parties WHERE plan_id IN (${ids}) ORDER BY plan_id, seq`).bind(...a),
        // A share stays paid only while its logged entry exists: deleting the transfer un-pays it.
        db.prepare(`SELECT p.plan_id, p.installment_no, p.party_seq, p.paid_at, p.entry_id, f.id AS proof_id, f.filename AS proof_filename, f.content_type AS proof_type
          FROM installment_payments p LEFT JOIN entry_groups g ON g.id = p.entry_id LEFT JOIN attachments f ON f.id = p.proof_id
          WHERE p.plan_id IN (${ids}) AND (p.entry_id IS NULL OR g.deleted_at IS NULL)`).bind(...a),
      ]);
      return {
        plans: plans.results as PlanRow[],
        parties: parties.results as PartyRow[],
        payments: payments.results.map((r): PaymentRow => ({
          plan_id: r.plan_id as string, installment_no: r.installment_no as number, party_seq: r.party_seq as number,
          paid_at: r.paid_at as string, entry_id: r.entry_id as string | null,
          proof: r.proof_id ? { id: r.proof_id as string, filename: r.proof_filename as string, content_type: r.proof_type as string } : null,
        })),
      };
    },

    async addPayment(ws: string, p: Omit<PaymentRow, 'proof'>) {
      // A row left behind by a deleted entry is replaced, so the share can be paid again.
      const r = await db.prepare(`INSERT INTO installment_payments (plan_id, installment_no, party_seq, paid_at, entry_id)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM installment_plans WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL)
        ON CONFLICT (plan_id, installment_no, party_seq) DO UPDATE SET paid_at = excluded.paid_at, entry_id = excluded.entry_id, proof_id = NULL
        WHERE installment_payments.entry_id IS NOT NULL AND (SELECT deleted_at FROM entry_groups WHERE id = installment_payments.entry_id) IS NOT NULL`)
        .bind(p.plan_id, p.installment_no, p.party_seq, p.paid_at, p.entry_id, p.plan_id, ws).run();
      if (!r.meta.changes) throw new Error('ALREADY_PAID');
    },

    /** Removes a paid share; returns its logged entry id (or null), or undefined when there was none. */
    async deletePayment(ws: string, planId: string, no: number, seq: number) {
      const row = await db.prepare(`SELECT entry_id FROM installment_payments WHERE ${owned} AND installment_no = ? AND party_seq = ?`)
        .bind(planId, ws, no, seq).first<{ entry_id: string | null }>();
      if (!row) return undefined;
      await db.prepare(`DELETE FROM installment_payments WHERE ${owned} AND installment_no = ? AND party_seq = ?`).bind(planId, ws, no, seq).run();
      return row.entry_id;
    },

    async setProof(ws: string, planId: string, no: number, seq: number, attachmentId: string | null) {
      const r = await db.prepare(`UPDATE installment_payments SET proof_id = ? WHERE ${owned} AND installment_no = ? AND party_seq = ?`)
        .bind(attachmentId, planId, ws, no, seq).run();
      return r.meta.changes > 0;
    },

    async deletePlan(ws: string, id: string) {
      const r = await db.prepare("UPDATE installment_plans SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws).run();
      return r.meta.changes > 0;
    },
  };
}
