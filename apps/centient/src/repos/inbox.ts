// Inbox items: payments waiting for the owner's OK, and the read over the ledger that finds an entry one of
// them may duplicate.
import { all, uid, updateStatement } from './sql';

export type InboxItem = {
  id: string;
  source: string;
  kind: 'TRANSACTION' | 'BALANCE';
  status: 'REVIEW' | 'SAVED' | 'DISMISSED';
  import_id: string | null;
  /** Signed: below zero is money out. null = a photo whose amount could not be read. */
  amount: number | null;
  occurred_at: string;
  merchant: string | null;
  note: string | null;
  /** null = a photo taken with no account picked. */
  account_id: string | null;
  category_id: string | null;
  suggested_entry_id: string | null;
  entry_id: string | null;
};
export type NewInboxItem = Pick<
  InboxItem,
  | 'source'
  | 'import_id'
  | 'amount'
  | 'occurred_at'
  | 'merchant'
  | 'note'
  | 'account_id'
  | 'category_id'
  | 'suggested_entry_id'
> & {
  content_hash: string | null;
  kind?: InboxItem['kind'];
  external_ref?: string;
  raw_text?: string;
};

const COLUMNS =
  'i.id, i.source, i.kind, i.status, i.import_id, i.amount, i.occurred_at, i.merchant, i.note, i.account_id, i.category_id, i.suggested_entry_id, i.entry_id';
// The suggested entry as it is now: gone (deleted since) reads as no suggestion.
const SUGGESTED = `(SELECT substr(t.occurred_at, 1, 10) || '|' || COALESCE(t.merchant, '') FROM transactions t
  WHERE t.group_id = i.suggested_entry_id AND t.deleted_at IS NULL ORDER BY t.rowid LIMIT 1) AS suggested`;
const PATCHABLE = ['status', 'category_id', 'account_id', 'entry_id'];

export function inboxRepo(db: D1Database) {
  return {
    /**
     * The inserts for new items, all REVIEW. With `skipKnown` (an import) an item whose content_hash is already
     * there is passed over; without it (one capture) the same hash or reference is a UNIQUE error, so the caller
     * hears that it was a duplicate.
     */
    insertStatements(ws: string, rows: (NewInboxItem & { id?: string })[], skipKnown = true) {
      return rows.map(r =>
        db
          .prepare(
            `INSERT ${skipKnown ? 'OR IGNORE ' : ''}INTO inbox_items (id, workspace_id, source, kind, status, import_id, content_hash, external_ref, amount, occurred_at, merchant, note, account_id, category_id, suggested_entry_id, raw_text)
            VALUES (?, ?, ?, ?, 'REVIEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            r.id ?? uid(),
            ws,
            r.source,
            r.kind ?? 'TRANSACTION',
            r.import_id,
            r.content_hash,
            r.external_ref ?? null,
            r.amount,
            r.occurred_at,
            r.merchant,
            r.note,
            r.account_id,
            r.category_id,
            r.suggested_entry_id,
            r.raw_text ?? null,
          ),
      );
    },

    /** Items waiting for review (of one import when given), oldest payment first; `suggested` is `day|merchant` or null. */
    review(ws: string, o: { importId?: string; limit: number }) {
      return all<InboxItem & { suggested: string | null }>(
        db,
        `SELECT ${COLUMNS}, ${SUGGESTED} FROM inbox_items i
        WHERE i.workspace_id = ? AND i.status = 'REVIEW' AND (? IS NULL OR i.import_id = ?)
        ORDER BY i.occurred_at, i.rowid LIMIT ?`,
        ws,
        o.importId ?? null,
        o.importId ?? null,
        o.limit,
      );
    },

    async count(ws: string) {
      const r = await db
        .prepare(
          "SELECT COUNT(*) AS n FROM inbox_items WHERE workspace_id = ? AND status = 'REVIEW'",
        )
        .bind(ws)
        .first<{ n: number }>();
      return r?.n ?? 0;
    },

    get(ws: string, id: string) {
      return db
        .prepare(
          `SELECT ${COLUMNS}, ${SUGGESTED} FROM inbox_items i WHERE i.workspace_id = ? AND i.id = ?`,
        )
        .bind(ws, id)
        .first<InboxItem & { suggested: string | null }>();
    },

    /** The UPDATE for an item's status, category or entry, for a caller that batches it with a ledger write. */
    updateStatement(ws: string, id: string, patch: Partial<InboxItem>) {
      return updateStatement(db, 'inbox_items', PATCHABLE, ws, id, patch)!;
    },

    /** The latest imports: how many rows each brought, how many still wait, how many became new entries. */
    imports(ws: string) {
      return all<{ id: string; created_at: string; rows: number; review: number; added: number }>(
        db,
        `SELECT import_id AS id, MIN(created_at) AS created_at, COUNT(*) AS rows,
          SUM(status = 'REVIEW') AS review,
          SUM(status = 'SAVED' AND entry_id IS NOT suggested_entry_id) AS added
        FROM inbox_items WHERE workspace_id = ? AND import_id IS NOT NULL
        GROUP BY import_id ORDER BY created_at DESC LIMIT 5`,
        ws,
      );
    },

    /** The entries an import created (Add, not Link): what undoing it deletes. */
    async addedBy(ws: string, importId: string) {
      const rows = await all<{ entry_id: string }>(
        db,
        `SELECT entry_id FROM inbox_items WHERE workspace_id = ? AND import_id = ? AND status = 'SAVED'
          AND entry_id IS NOT NULL AND entry_id IS NOT suggested_entry_id`,
        ws,
        importId,
      );
      return rows.map(r => r.entry_id);
    },

    removeImportStatement(ws: string, importId: string) {
      return db
        .prepare('DELETE FROM inbox_items WHERE workspace_id = ? AND import_id = ?')
        .bind(ws, importId);
    },

    /** Live account lines between two days: what an incoming payment is compared with to spot a duplicate. */
    lines(ws: string, from: string, to: string) {
      return all<{ entry_id: string; account_id: string; amount: number; day: string }>(
        db,
        `SELECT t.group_id AS entry_id, e.account_id, e.amount, substr(t.occurred_at, 1, 10) AS day
        FROM entries e JOIN transactions t ON t.id = e.transaction_id
        WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND t.group_id IS NOT NULL
          AND substr(t.occurred_at, 1, 10) BETWEEN ? AND ?`,
        ws,
        from,
        to,
      );
    },
  };
}
