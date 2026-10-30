// Budgets: a limit per cycle on a category and/or a pocket, in one currency. Limits are dated so past cycles keep theirs.
// A temporary budget has its own dates [starts_on, ends_on) and one limit for the whole run.
import { all, uid } from './sql';

type Target = { categoryId: string | null; envelopeId: string | null; currency: string };

export type Budget = {
  id: string; category_id: string | null; envelope_id: string | null; currency_code: string;
  starts_on: string | null; ends_on: string | null;
  limits: { effective_from: string; amount: number }[];
};

const SAME_TARGET = `workspace_id = ? AND IFNULL(category_id, '') = ? AND IFNULL(envelope_id, '') = ? AND currency_code = ? AND deleted_at IS NULL`;
const target = (ws: string, t: Target) => [ws, t.categoryId ?? '', t.envelopeId ?? '', t.currency];

export function budgetsRepo(db: D1Database) {
  return {
    async list(ws: string): Promise<Budget[]> {
      const budgets = await all<Omit<Budget, 'limits'>>(db, 'SELECT id, category_id, envelope_id, currency_code, starts_on, ends_on FROM budgets WHERE workspace_id = ? AND deleted_at IS NULL', ws);
      const limits = await all<{ budget_id: string; effective_from: string; amount: number }>(db,
        'SELECT l.budget_id, l.effective_from, l.amount FROM budget_limits l JOIN budgets b ON b.id = l.budget_id WHERE b.workspace_id = ? AND b.deleted_at IS NULL', ws);
      return budgets.map(b => ({ ...b, limits: limits.filter(l => l.budget_id === b.id) }));
    },

    async set(ws: string, t: Target, amount: number, effectiveFrom: string) {
      const found = await db.prepare(`SELECT id FROM budgets WHERE ${SAME_TARGET} AND starts_on IS NULL`).bind(...target(ws, t)).first<{ id: string }>();
      const id = found?.id ?? uid();
      const stmts = [];
      if (!found) stmts.push(db.prepare('INSERT INTO budgets (id, workspace_id, category_id, envelope_id, currency_code) VALUES (?, ?, ?, ?, ?)').bind(id, ws, t.categoryId, t.envelopeId, t.currency));
      // A new limit takes effect from the current cycle; past cycles keep theirs, so savings history stays true.
      stmts.push(db.prepare('INSERT INTO budget_limits (budget_id, effective_from, amount) VALUES (?, ?, ?) ON CONFLICT (budget_id, effective_from) DO UPDATE SET amount = excluded.amount')
        .bind(id, effectiveFrom, amount));
      await db.batch(stmts);
      return id;
    },

    /** The live temporary budget on this target starting on `startsOn`, if any. */
    temporaryAt(ws: string, t: Target, startsOn: string) {
      return db.prepare(`SELECT id, starts_on, ends_on FROM budgets WHERE ${SAME_TARGET} AND starts_on = ?`).bind(...target(ws, t), startsOn)
        .first<{ id: string; starts_on: string; ends_on: string }>();
    },

    /** Another temporary budget on this target whose dates meet [startsOn, endsOn); back to back does not. */
    overlapping(ws: string, t: Target, startsOn: string, endsOn: string, except = '') {
      return db.prepare(`SELECT starts_on, ends_on FROM budgets WHERE ${SAME_TARGET} AND starts_on < ? AND ends_on > ? AND id <> ?`)
        .bind(...target(ws, t), endsOn, startsOn, except).first<{ starts_on: string; ends_on: string }>();
    },

    /** Creates a temporary budget, or changes the one starting that day (its limit and length). */
    async setTemporary(ws: string, t: Target, amount: number, startsOn: string, endsOn: string, id: string = uid()) {
      await db.batch([
        db.prepare(`INSERT INTO budgets (id, workspace_id, category_id, envelope_id, currency_code, starts_on, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET ends_on = excluded.ends_on`).bind(id, ws, t.categoryId, t.envelopeId, t.currency, startsOn, endsOn),
        db.prepare('INSERT INTO budget_limits (budget_id, effective_from, amount) VALUES (?, ?, ?) ON CONFLICT (budget_id, effective_from) DO UPDATE SET amount = excluded.amount')
          .bind(id, startsOn, amount),
      ]);
      return id;
    },

    async remove(ws: string, id: string) {
      const r = await db.prepare("UPDATE budgets SET deleted_at = datetime('now') WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(id, ws).run();
      return r.meta.changes > 0;
    },
  };
}
