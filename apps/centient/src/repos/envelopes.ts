// Pockets (table `envelopes`): parts of one account's money. The account's balance is the sum of its pockets.
import { all, uid, updateColumns } from './sql';

export type Envelope = {
  id: string; account_id: string; name: string; currency_code: string; kind: 'SPENDING' | 'SAVINGS' | 'GOAL';
  target_amount: number | null; target_date: string | null; archived_at: string | null;
  /** Hex color the user picked for the pocket's card; null = the default for its place. */
  color: string | null;
  /** Which card pattern (0-23); unique among an account's live pockets. */
  pattern: number;
};

const PATCHABLE = ['name', 'currency_code', 'target_amount', 'target_date', 'archived_at', 'color'];

export function envelopesRepo(db: D1Database) {
  return {
    // Main first in each account, then by name.
    list(ws: string) {
      return all<Envelope>(db, `SELECT e.id, e.account_id, e.name, e.currency_code, e.kind, e.target_amount, e.target_date, e.archived_at, e.color, e.pattern
        FROM envelopes e JOIN accounts a ON a.id = e.account_id AND a.deleted_at IS NULL
        WHERE e.workspace_id = ? ORDER BY e.account_id, e.id <> a.default_envelope_id, e.name`, ws);
    },

    async create(ws: string, e: Omit<Envelope, 'id' | 'archived_at'>): Promise<Envelope> {
      const id = uid();
      await db.prepare('INSERT INTO envelopes (id, workspace_id, account_id, name, currency_code, kind, target_amount, target_date, color, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, ws, e.account_id, e.name, e.currency_code, e.kind, e.target_amount, e.target_date, e.color, e.pattern).run();
      return { ...e, id, archived_at: null };
    },

    /** Patches whitelisted columns; false when the pocket is not in this workspace. */
    update(ws: string, id: string, patch: Record<string, unknown>) {
      return updateColumns(db, 'envelopes', PATCHABLE, ws, id, patch);
    },
  };
}
