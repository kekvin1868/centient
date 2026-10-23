// Users and workspaces, including the first sign-in seed.
import { accountInserts } from './accounts';
import { uid } from './sql';

export type Workspace = { id: string; name: string; cycle_start_day: number; onboarded_at: string | null };

// Few and broad on purpose: each one should be obvious to pick. "Fees" is looked up by name for transfer fees.
const SEED_EXPENSE = ['Food & Drink', 'Transport', 'Home & Bills', 'Shopping', 'Health', 'Fun', 'Education',
  'Family & Giving', 'Fees', 'Other'];
// "Balance adjustment" holds uncategorised balance corrections (signed), so it is not a spending category.
const SEED_INCOME = ['Salary', 'Angpao & THR', 'Interest & cashback', 'Opening balance', 'Balance adjustment', 'Other income'];

// A new workspace's accounts: how most people in Indonesia hold money day to day. Each gets a Main pocket.
const SEED_ACCOUNTS: [string, string][] = [['Main Account', 'BANK'], ['Dailies', 'EWALLET'], ['Miscs', 'DEBIT_CARD']];

export function workspacesRepo(db: D1Database) {
  const s = (sql: string, ...v: unknown[]) => db.prepare(sql).bind(...v);

  async function seed(ws: string, userId: string) {
    await db.batch([
      s('INSERT INTO workspaces (id, name) VALUES (?, ?)', ws, 'My money'),
      s("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'OWNER')", ws, userId),
      ...SEED_ACCOUNTS.flatMap(([name, kind]) => accountInserts(db, ws, uid(), { name, kind, provider: null, currency_code: 'IDR', due_day: null })),
      ...SEED_EXPENSE.map(n => s("INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, 'EXPENSE')", uid(), ws, n)),
      ...SEED_INCOME.map(n => s("INSERT INTO categories (id, workspace_id, name, kind) VALUES (?, ?, ?, 'INCOME')", uid(), ws, n)),
    ]);
  }

  return {
    /** Finds the user's workspace, creating user, workspace and seed data on first sign-in. */
    async ensure(email: string): Promise<{ userId: string; workspaceId: string }> {
      await s('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)', uid(), email.toLowerCase()).run();
      const userId = (await s('SELECT id FROM users WHERE email = ?', email.toLowerCase()).first<{ id: string }>())!.id;
      // Oldest live workspace first (rowid order), so a user who has duplicates always lands in the same one.
      const live = () => s(`SELECT m.workspace_id FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ? AND w.deleted_at IS NULL ORDER BY w.rowid LIMIT 1`, userId).first<{ workspace_id: string }>();
      const member = await live();
      if (member) return { userId, workspaceId: member.workspace_id };

      // The app's first screen sends several requests at once; each would seed its own workspace. The id is
      // derived from the user and how many workspaces they have had (a reset adds one), so simultaneous first
      // requests pick the same id: one seeding commits, the others fail on its unique rows and read it back.
      const { n } = (await s('SELECT COUNT(*) AS n FROM workspace_members WHERE user_id = ?', userId).first<{ n: number }>())!;
      const ws = `${userId}:${n + 1}`;
      try {
        await seed(ws, userId);
      } catch (e) {
        const won = await live();
        if (won) return { userId, workspaceId: won.workspace_id };
        throw e;
      }
      return { userId, workspaceId: ws };
    },

    async get(ws: string) {
      return (await s('SELECT id, name, cycle_start_day, onboarded_at FROM workspaces WHERE id = ?', ws).first<Workspace>())!;
    },

    async update(ws: string, patch: { name?: string; cycle_start_day?: number; onboarded_at?: string }) {
      await s('UPDATE workspaces SET name = COALESCE(?, name), cycle_start_day = COALESCE(?, cycle_start_day), onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?',
        patch.name ?? null, patch.cycle_start_day ?? null, patch.onboarded_at ?? null, ws).run();
    },

    /** Soft-deletes the whole workspace; the user's next request gets a fresh one. */
    async reset(ws: string, now: string) {
      await s('UPDATE workspaces SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', now, ws).run();
    },
  };
}
