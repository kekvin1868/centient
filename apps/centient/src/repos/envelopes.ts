// Pockets (table `envelopes`): parts of one account's money. The account's balance is the sum of its pockets.
import { all, uid, updateColumns } from './sql';

export type Envelope = {
  id: string;
  account_id: string;
  name: string;
  currency_code: string;
  kind: 'SPENDING' | 'SAVINGS' | 'GOAL';
  target_amount: number | null;
  target_date: string | null;
  archived_at: string | null;
  /** Hex color the user picked for the pocket's card; null = the default for its place. */
  color: string | null;
  /** Which card pattern (0-23); unique among an account's live pockets. */
  pattern: number;
};

const PATCHABLE = [
  'name',
  'kind',
  'currency_code',
  'target_amount',
  'target_date',
  'archived_at',
  'color',
];

export function envelopesRepo(db: D1Database) {
  return {
    // Main first in each account, then by name.
    list(ws: string) {
      return all<Envelope>(
        db,
        `SELECT e.id, e.account_id, e.name, e.currency_code, e.kind, e.target_amount, e.target_date, e.archived_at, e.color, e.pattern
        FROM envelopes e JOIN accounts a ON a.id = e.account_id AND a.deleted_at IS NULL
        WHERE e.workspace_id = ? AND e.deleted_at IS NULL ORDER BY e.account_id, e.id <> a.default_envelope_id, e.name`,
        ws,
      );
    },

    async create(ws: string, e: Omit<Envelope, 'id' | 'archived_at'>): Promise<Envelope> {
      const id = uid();
      await db
        .prepare(
          'INSERT INTO envelopes (id, workspace_id, account_id, name, currency_code, kind, target_amount, target_date, color, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          id,
          ws,
          e.account_id,
          e.name,
          e.currency_code,
          e.kind,
          e.target_amount,
          e.target_date,
          e.color,
          e.pattern,
        )
        .run();
      return { ...e, id, archived_at: null };
    },

    /**
     * Deletes a pocket into its account's Main pocket `main`, in one batch:
     * - each line in it moves to Main; where an entry already has a Main line (a move between them) the two merge,
     *   and a move that nets to nothing is deleted with its entry
     * - saved commands, bills on a date and inbox payments that name it name Main instead
     * - its budgets and category links go; the row is flagged and renamed (its name is free again)
     * `at`: the time written as deleted_at (SQLite's datetime format, so it matches the entries it deletes).
     */
    async remove(ws: string, id: string, main: string, at: string) {
      const both = 'SELECT transaction_id FROM allocations WHERE envelope_id = ?';
      // Entries whose pocket line and Main line cancel out: a move between the two (an allocation row is never 0).
      const evens = `SELECT x.transaction_id FROM allocations x JOIN allocations m ON m.transaction_id = x.transaction_id
        WHERE x.envelope_id = ? AND m.envelope_id = ? AND x.amount + m.amount = 0`;
      const nameTo = (key: string) =>
        db
          .prepare(
            `UPDATE entry_groups SET command = json_set(command, '$.${key}', ?) WHERE workspace_id = ? AND command IS NOT NULL AND json_extract(command, '$.${key}') = ?`,
          )
          .bind(main, ws, id);
      await db.batch([
        // A move between the two would be Main to Main: it is deleted, with its entry (when it held nothing else)...
        db
          .prepare(
            `UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE workspace_id = ? AND deleted_at IS NULL
            AND id IN (${evens})
            AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.transaction_id = transactions.id AND a.envelope_id NOT IN (?, ?))
            AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.transaction_id = transactions.id)`,
          )
          .bind(at, at, ws, id, main, id, main),
        db
          .prepare(
            `UPDATE entry_groups SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM transactions t WHERE t.group_id = entry_groups.id AND t.deleted_at = ?)
            AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.group_id = entry_groups.id AND t.deleted_at IS NULL)`,
          )
          .bind(at, ws, at),
        // ...and both its lines go.
        db
          .prepare(
            `DELETE FROM allocations WHERE envelope_id IN (?, ?) AND transaction_id IN (${evens})`,
          )
          .bind(id, main, id, main),
        // Any other entry with lines in both: Main's line takes the pocket's amount, the pocket's goes.
        db
          .prepare(
            `UPDATE allocations SET amount = amount + (SELECT x.amount FROM allocations x WHERE x.transaction_id = allocations.transaction_id AND x.envelope_id = ?)
            WHERE envelope_id = ? AND transaction_id IN (${both})`,
          )
          .bind(id, main, id),
        db
          .prepare(`DELETE FROM allocations WHERE envelope_id = ? AND transaction_id IN (${both})`)
          .bind(id, main),
        // Everything else simply moves.
        db.prepare('UPDATE allocations SET envelope_id = ? WHERE envelope_id = ?').bind(main, id),
        nameTo('envelopeId'),
        nameTo('fromEnvelopeId'),
        nameTo('toEnvelopeId'),
        db
          .prepare(
            'UPDATE recurring SET envelope_id = ? WHERE workspace_id = ? AND envelope_id = ?',
          )
          .bind(main, ws, id),
        db
          .prepare(
            'UPDATE inbox_items SET envelope_id = ? WHERE workspace_id = ? AND envelope_id = ?',
          )
          .bind(main, ws, id),
        db.prepare('DELETE FROM envelope_categories WHERE envelope_id = ?').bind(id),
        db
          .prepare(
            'UPDATE budgets SET deleted_at = ? WHERE workspace_id = ? AND envelope_id = ? AND deleted_at IS NULL',
          )
          .bind(at, ws, id),
        db
          .prepare(
            "UPDATE envelopes SET deleted_at = ?, name = name || ' (deleted ' || substr(id, 1, 8) || ')' WHERE workspace_id = ? AND id = ?",
          )
          .bind(at, ws, id),
      ]);
    },

    /** Patches whitelisted columns; false when the pocket is not in this workspace. */
    update(ws: string, id: string, patch: Record<string, unknown>) {
      return updateColumns(db, 'envelopes', PATCHABLE, ws, id, patch);
    },
  };
}
