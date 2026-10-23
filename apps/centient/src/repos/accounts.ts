// Accounts: where money is held (bank, e-wallet, card, IOU, ...). Each has a Main pocket.
import { all, uid, updateColumns } from './sql';

export type Account = {
  id: string; name: string; kind: string; provider: string | null; currency_code: string;
  default_envelope_id: string | null; due_day: number | null; reconciled_at: string | null; archived_at: string | null;
};
export type NewAccount = Omit<Account, 'id' | 'reconciled_at' | 'archived_at' | 'default_envelope_id'>;

// "Debit card" is stored as kind BANK + subtype DEBIT_CARD (migration 0007: the accounts table's kind CHECK
// cannot change without a rebuild that D1's always-on foreign keys block). Only this file knows that.
const KIND_SQL = "CASE WHEN subtype = 'DEBIT_CARD' THEN 'DEBIT_CARD' ELSE kind END";
const storedKind = (kind: string) => (kind === 'DEBIT_CARD' ? { kind: 'BANK', subtype: 'DEBIT_CARD' } : { kind, subtype: null });

/** Columns a PATCH may touch. Anything else in the request is ignored. */
const PATCHABLE = ['name', 'kind', 'subtype', 'provider', 'currency_code', 'default_envelope_id', 'due_day', 'reconciled_at', 'archived_at'];

/** An account and its Main pocket (its default): account first, pocket, then the default link. */
export function accountInserts(db: D1Database, ws: string, id: string, a: NewAccount): D1PreparedStatement[] {
  const k = storedKind(a.kind);
  const main = `${id}:main`;
  return [
    db.prepare('INSERT INTO accounts (id, workspace_id, name, kind, subtype, provider, currency_code, due_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ws, a.name, k.kind, k.subtype, a.provider, a.currency_code, a.due_day),
    db.prepare("INSERT INTO envelopes (id, workspace_id, account_id, name, currency_code, kind) VALUES (?, ?, ?, 'Main', ?, 'SPENDING')").bind(main, ws, id, a.currency_code),
    db.prepare('UPDATE accounts SET default_envelope_id = ? WHERE id = ?').bind(main, id),
  ];
}

export function accountsRepo(db: D1Database) {
  return {
    list(ws: string) {
      return all<Account>(db, `SELECT id, name, ${KIND_SQL} AS kind, provider, currency_code, default_envelope_id, due_day, reconciled_at, archived_at
        FROM accounts WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY name`, ws);
    },

    /** Creates the account with its Main pocket (the account's default). */
    async create(ws: string, a: NewAccount): Promise<Account> {
      const id = uid();
      await db.batch(accountInserts(db, ws, id, a));
      return { ...a, id, default_envelope_id: `${id}:main`, reconciled_at: null, archived_at: null };
    },

    /** Patches whitelisted columns; false when the account is not in this workspace. */
    update(ws: string, id: string, patch: Record<string, unknown>) {
      if (typeof patch.kind === 'string') patch = { ...patch, ...storedKind(patch.kind) };
      return updateColumns(db, 'accounts', PATCHABLE, ws, id, patch, ' AND deleted_at IS NULL');
    },

    /** Soft-deletes the account and every entry that touches it; false when it is not in this workspace. */
    async remove(ws: string, id: string, now: string) {
      // Whole entries go, so a split bill paid from this account disappears with its IOU half.
      // ponytail: the name gets a suffix because accounts keep UNIQUE (workspace_id, name); a partial
      // index needs a table rebuild, worth it only if deleted names must stay readable in the database.
      const [, , acc] = await db.batch([
        db.prepare(`UPDATE entry_groups SET deleted_at = ? WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (
          SELECT t.group_id FROM transactions t JOIN entries e ON e.transaction_id = t.id
          WHERE t.workspace_id = ? AND e.account_id = ? AND t.deleted_at IS NULL)`).bind(now, ws, ws, id),
        db.prepare(`UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE workspace_id = ? AND deleted_at IS NULL
          AND group_id IN (SELECT id FROM entry_groups WHERE workspace_id = ? AND deleted_at = ?)`).bind(now, now, ws, ws, now),
        db.prepare(`UPDATE accounts SET deleted_at = ?, name = name || ' (deleted ' || ? || ')' WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`)
          .bind(now, now, id, ws),
      ]);
      return acc.meta.changes > 0;
    },
  };
}
