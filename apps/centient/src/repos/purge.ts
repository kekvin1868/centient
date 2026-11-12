// Delete account: the statements that erase a user and everything in every workspace they have had (a reset
// leaves the old workspace behind, flagged; this removes those too). Children go before what they point at,
// because D1 always enforces foreign keys. A new table that holds workspace or user data must be added here;
// test/purge.test.ts fails when one with a workspace_id or user_id column still has rows afterwards.

const OF_USER = 'SELECT workspace_id FROM workspace_members WHERE user_id = ?1';
const inWs = (table: string) => `DELETE FROM ${table} WHERE workspace_id IN (${OF_USER})`;
const under = (table: string, key: string, parent: string) =>
  `DELETE FROM ${table} WHERE ${key} IN (SELECT id FROM ${parent} WHERE workspace_id IN (${OF_USER}))`;

const STATEMENTS = [
  under('entries', 'transaction_id', 'transactions'),
  under('allocations', 'transaction_id', 'transactions'),
  under('installment_payments', 'plan_id', 'installment_plans'),
  under('installment_parties', 'plan_id', 'installment_plans'),
  under('budget_limits', 'budget_id', 'budgets'),
  under('budget_alerts', 'budget_id', 'budgets'),
  under('envelope_categories', 'envelope_id', 'envelopes'),
  inWs('inbox_items'),
  inWs('statement_imports'),
  inWs('recurring'),
  inWs('recurring_hidden'),
  inWs('account_name_history'),
  inWs('merchant_icons'),
  inWs('aliases'),
  inWs('budgets'),
  inWs('installment_plans'),
  inWs('attachments'),
  inWs('transactions'),
  inWs('entry_groups'),
  // Accounts and pockets point at each other; cut the account's side first.
  `UPDATE accounts SET default_envelope_id = NULL WHERE workspace_id IN (${OF_USER})`,
  inWs('envelopes'),
  inWs('accounts'),
  inWs('categories'),
  'DELETE FROM passkeys WHERE user_id = ?1',
  'DELETE FROM unlock_sessions WHERE user_id = ?1',
  'DELETE FROM lock_challenges WHERE user_id = ?1',
  'DELETE FROM push_subscriptions WHERE user_id = ?1',
  // Membership is how the workspaces are found, so they go last: the workspaces by a list read before.
];

export function purgeRepo(db: D1Database) {
  return {
    /** The R2 keys of the user's files, to delete from the bucket once the rows are gone. */
    async fileKeys(userId: string) {
      const rows = await db
        .prepare(`SELECT r2_key FROM attachments WHERE workspace_id IN (${OF_USER})`)
        .bind(userId)
        .all<{ r2_key: string }>();
      return rows.results.map(r => r.r2_key);
    },

    /** Erases the user in one atomic batch. */
    async user(userId: string) {
      const owned = await db.prepare(OF_USER).bind(userId).all<{ workspace_id: string }>();
      await db.batch([
        ...STATEMENTS.map(sql => db.prepare(sql).bind(userId)),
        db.prepare('DELETE FROM workspace_members WHERE user_id = ?').bind(userId),
        ...owned.results.map(w =>
          db.prepare('DELETE FROM workspaces WHERE id = ?').bind(w.workspace_id),
        ),
        db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
      ]);
    },
  };
}
