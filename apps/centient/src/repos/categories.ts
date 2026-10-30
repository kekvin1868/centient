// Spending and income categories.
import { all, uid, updateColumns } from './sql';

export type Category = { id: string; name: string; kind: 'EXPENSE' | 'INCOME'; archived_at: string | null };

const PATCHABLE = ['name', 'archived_at'];

export function categoriesRepo(db: D1Database) {
  return {
    list(ws: string) {
      return all<Category>(db, 'SELECT id, name, kind, archived_at FROM categories WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY kind, name', ws);
    },

    async create(ws: string, c: Omit<Category, 'id' | 'archived_at'>): Promise<Category> {
      const id = uid();
      await db.prepare('INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, ?)').bind(id, ws, c.name, c.kind).run();
      return { ...c, id, archived_at: null };
    },

    /** Patches whitelisted columns; false when the category is not in this workspace. */
    update(ws: string, id: string, patch: Record<string, unknown>) {
      return updateColumns(db, 'categories', PATCHABLE, ws, id, patch);
    },

    /** Moves everything in a category to another, then soft-deletes it; false when it is not in this workspace. */
    async remove(ws: string, id: string, moveTo: string, now: string) {
      // Everything that points at the category moves first (as in migration 0004), then it is flagged and
      // renamed to free its UNIQUE name, so a new category can take it.
      const moved = (col: string) => `${col} = CASE WHEN ${col} = ? THEN ? ELSE ${col} END`;
      const [, , , , , , , cat] = await db.batch([
        db.prepare(`UPDATE transactions SET ${moved('category_id')} WHERE workspace_id = ? AND category_id = ?`).bind(id, moveTo, ws, id),
        db.prepare("UPDATE entry_groups SET command = json_set(command, '$.categoryId', ?) WHERE workspace_id = ? AND command IS NOT NULL AND json_extract(command, '$.categoryId') = ?").bind(moveTo, ws, id),
        db.prepare("UPDATE aliases SET value = ? WHERE workspace_id = ? AND kind = 'CATEGORY' AND value = ?").bind(moveTo, ws, id),
        db.prepare('UPDATE recurring SET category_id = ? WHERE workspace_id = ? AND category_id = ?').bind(moveTo, ws, id),
        db.prepare('UPDATE inbox_items SET category_id = ? WHERE workspace_id = ? AND category_id = ?').bind(moveTo, ws, id),
        // A budget on the deleted category goes if the target already has one (same pocket, currency and start), else follows it.
        db.prepare(`UPDATE budgets SET deleted_at = ? WHERE workspace_id = ? AND category_id = ? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM budgets t WHERE t.workspace_id = budgets.workspace_id AND t.category_id = ? AND IFNULL(t.envelope_id, '') = IFNULL(budgets.envelope_id, '') AND t.currency_code = budgets.currency_code AND IFNULL(t.starts_on, '') = IFNULL(budgets.starts_on, '') AND t.deleted_at IS NULL)`).bind(now, ws, id, moveTo),
        db.prepare('UPDATE budgets SET category_id = ? WHERE workspace_id = ? AND category_id = ? AND deleted_at IS NULL').bind(moveTo, ws, id),
        db.prepare("UPDATE categories SET deleted_at = ?, name = name || ' (deleted ' || ? || ')' WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL").bind(now, now, id, ws),
      ]);
      return cat.meta.changes > 0;
    },
  };
}
