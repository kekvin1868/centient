// Read-only sums over the ledger for Insights. Spending = EXPENSE allocations (a split bill's EXPENSE is only my share,
// a fee is its own EXPENSE); income = INCOME allocations outside "Opening balance" and "Balance adjustment".
// The currency is the pocket's (allocations), dates are the Jakarta day of `occurred_at`, periods are [from, to).
import { all } from './sql';

const COUNTED = `t.workspace_id = ? AND t.deleted_at IS NULL AND substr(t.occurred_at, 1, 10) >= ? AND substr(t.occurred_at, 1, 10) < ?`;

export type CurrencyTotals = { currency: string; spending: number; income: number; entries: number };

export function reportsRepo(db: D1Database) {
  return {
    /** Spending, income and how many entries counted, per currency with any of them in [from, to). */
    totals: (ws: string, from: string, to: string) => all<CurrencyTotals>(db, `SELECT e.currency_code AS currency,
        COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN -a.amount ELSE 0 END), 0) AS spending,
        COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN a.amount ELSE 0 END), 0) AS income,
        COUNT(DISTINCT t.id) AS entries
      FROM transactions t JOIN allocations a ON a.transaction_id = t.id JOIN envelopes e ON e.id = a.envelope_id
        JOIN categories c ON c.id = t.category_id
      WHERE ${COUNTED} AND (t.type = 'EXPENSE' OR (t.type = 'INCOME' AND c.name NOT IN ('Opening balance', 'Balance adjustment')))
      GROUP BY e.currency_code`, ws, from, to),

    /** Spending per category in one currency, largest first. */
    byCategory: (ws: string, currency: string, from: string, to: string) => all<{ categoryId: string; amount: number }>(db, `SELECT t.category_id AS categoryId, SUM(-a.amount) AS amount
      FROM transactions t JOIN allocations a ON a.transaction_id = t.id JOIN envelopes e ON e.id = a.envelope_id AND e.currency_code = ?
      WHERE ${COUNTED} AND t.type = 'EXPENSE'
      GROUP BY t.category_id ORDER BY amount DESC`, currency, ws, from, to),

    /** The Jakarta day of the oldest live entry, any type and currency; null when there is none. */
    async oldest(ws: string): Promise<string | null> {
      const r = await db.prepare('SELECT MIN(substr(occurred_at, 1, 10)) AS day FROM transactions WHERE workspace_id = ? AND deleted_at IS NULL').bind(ws).first<{ day: string | null }>();
      return r?.day ?? null;
    },
  };
}
