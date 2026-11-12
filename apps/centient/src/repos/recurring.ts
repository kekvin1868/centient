// Recurring bills and subscriptions, the merchants hidden from "Found in your entries", and the two reads over
// the ledger they need (a card's statement sums, recent payments per merchant).
import { all, uid, updateStatement } from './sql';

export type Recurring = {
  id: string;
  name: string;
  account_id: string;
  envelope_id: string | null;
  category_id: string;
  /** NULL = the amount varies (electricity). */
  amount: number | null;
  every_months: number;
  next_due: string;
  due_day: number;
  ends_on: string | null;
  service: string | null;
  paused_at: string | null;
};
export type NewRecurring = Omit<Recurring, 'id' | 'paused_at'>;

const COLUMNS =
  'id, name, account_id, envelope_id, category_id, amount, every_months, next_due, due_day, ends_on, service, paused_at';
const PATCHABLE = COLUMNS.split(', ').filter(c => c !== 'id');

export function recurringRepo(db: D1Database) {
  return {
    /** Live bills, the soonest first. */
    list(ws: string) {
      return all<Recurring>(
        db,
        `SELECT ${COLUMNS} FROM recurring WHERE workspace_id = ? AND archived_at IS NULL ORDER BY next_due, name`,
        ws,
      );
    },

    async create(ws: string, r: NewRecurring) {
      const id = uid();
      await db
        .prepare(
          `INSERT INTO recurring (id, workspace_id, name, account_id, envelope_id, category_id, amount, every_months, next_due, due_day, ends_on, service)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          ws,
          r.name,
          r.account_id,
          r.envelope_id,
          r.category_id,
          r.amount,
          r.every_months,
          r.next_due,
          r.due_day,
          r.ends_on,
          r.service,
        )
        .run();
      return id;
    },

    /** The UPDATE for a live bill's columns, for a caller that batches it with a ledger write; null when empty. */
    updateStatement(ws: string, id: string, patch: Partial<Recurring> & { archived_at?: string }) {
      return updateStatement(
        db,
        'recurring',
        [...PATCHABLE, 'archived_at'],
        ws,
        id,
        patch,
        ' AND archived_at IS NULL',
      );
    },

    /** Patches a live bill; false when it is not in this workspace. */
    async update(ws: string, id: string, patch: Partial<Recurring> & { archived_at?: string }) {
      const stmt = this.updateStatement(ws, id, patch);
      return stmt ? (await stmt.run()).meta.changes > 0 : true;
    },

    async hidden(ws: string) {
      const rows = await all<{ merchant: string }>(
        db,
        'SELECT merchant FROM recurring_hidden WHERE workspace_id = ?',
        ws,
      );
      return rows.map(r => r.merchant);
    },

    async hide(ws: string, merchant: string) {
      await db
        .prepare('INSERT OR IGNORE INTO recurring_hidden (workspace_id, merchant) VALUES (?, ?)')
        .bind(ws, merchant)
        .run();
    },

    /**
     * A card's sums around a statement cut-off: its balance at the end of that day, then what came in
     * (payments) and what went out (new spending) after it.
     */
    async statement(ws: string, accountId: string, cutOff: string) {
      const r = await db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN substr(t.occurred_at, 1, 10) <= ?1 THEN e.amount END), 0) AS balance,
            COALESCE(SUM(CASE WHEN substr(t.occurred_at, 1, 10) > ?1 AND e.amount > 0 THEN e.amount END), 0) AS paid,
            COALESCE(SUM(CASE WHEN substr(t.occurred_at, 1, 10) > ?1 AND e.amount < 0 THEN -e.amount END), 0) AS spent
          FROM entries e JOIN transactions t ON t.id = e.transaction_id
          WHERE t.workspace_id = ?2 AND t.deleted_at IS NULL AND e.account_id = ?3`,
        )
        .bind(cutOff, ws, accountId)
        .first<{ balance: number; paid: number; spent: number }>();
      return r ?? { balance: 0, paid: 0, spent: 0 };
    },

    /** Expenses with a merchant since `since`, oldest first: what "Found in your entries" looks through. */
    payments(ws: string, since: string) {
      return all<{
        merchant: string;
        account_id: string;
        category_id: string;
        day: string;
        amount: number;
      }>(
        db,
        `SELECT t.merchant, e.account_id, t.category_id, substr(t.occurred_at, 1, 10) AS day, -e.amount AS amount
        FROM transactions t JOIN entries e ON e.transaction_id = t.id
        WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.type = 'EXPENSE' AND t.merchant IS NOT NULL
          AND e.amount < 0 AND substr(t.occurred_at, 1, 10) >= ?
        ORDER BY t.occurred_at`,
        ws,
        since,
      );
    },
  };
}
