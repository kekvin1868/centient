// Budgets: a limit per cycle on a category and/or a pocket. Limits are dated so past cycles keep theirs.
import { all, uid } from './sql';

export type Budget = {
  id: string; category_id: string | null; envelope_id: string | null;
  limits: { effective_from: string; amount: number }[];
};

export function budgetsRepo(db: D1Database) {
  return {
    async list(ws: string): Promise<Budget[]> {
      const budgets = await all<Omit<Budget, 'limits'>>(db, 'SELECT id, category_id, envelope_id FROM budgets WHERE workspace_id = ? AND deleted_at IS NULL', ws);
      const limits = await all<{ budget_id: string; effective_from: string; amount: number }>(db,
        'SELECT l.budget_id, l.effective_from, l.amount FROM budget_limits l JOIN budgets b ON b.id = l.budget_id WHERE b.workspace_id = ? AND b.deleted_at IS NULL', ws);
      return budgets.map(b => ({ ...b, limits: limits.filter(l => l.budget_id === b.id) }));
    },

    async set(ws: string, t: { categoryId: string | null; envelopeId: string | null }, amount: number, effectiveFrom: string) {
      const found = await db.prepare("SELECT id FROM budgets WHERE workspace_id = ? AND IFNULL(category_id, '') = ? AND IFNULL(envelope_id, '') = ? AND deleted_at IS NULL")
        .bind(ws, t.categoryId ?? '', t.envelopeId ?? '').first<{ id: string }>();
      const id = found?.id ?? uid();
      const stmts = [];
      if (!found) stmts.push(db.prepare('INSERT INTO budgets (id, workspace_id, category_id, envelope_id) VALUES (?, ?, ?, ?)').bind(id, ws, t.categoryId, t.envelopeId));
      // A new limit takes effect from the current cycle; past cycles keep theirs, so savings history stays true.
      stmts.push(db.prepare('INSERT INTO budget_limits (budget_id, effective_from, amount) VALUES (?, ?, ?) ON CONFLICT (budget_id, effective_from) DO UPDATE SET amount = excluded.amount')
        .bind(id, effectiveFrom, amount));
      await db.batch(stmts);
      return id;
    },

    async remove(ws: string, id: string) {
      const r = await db.prepare("UPDATE budgets SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws).run();
      return r.meta.changes > 0;
    },
  };
}
