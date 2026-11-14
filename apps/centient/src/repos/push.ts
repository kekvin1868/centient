// Web Push subscriptions: one per browser that turned reminders on, kept per person.
import { all, uid } from './sql';

export type Subscription = { endpoint: string; p256dh: string; auth: string };

export function pushRepo(db: D1Database) {
  return {
    ofUser(userId: string) {
      return all<Subscription>(
        db,
        'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
        userId,
      );
    },

    /** Saves a browser's subscription; the same browser again (same endpoint) replaces its keys and owner. */
    async save(userId: string, s: Subscription) {
      await db
        .prepare(
          `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
        )
        .bind(uid(), userId, s.endpoint, s.p256dh, s.auth)
        .run();
    },

    async remove(userId: string, endpoint: string) {
      await db
        .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
        .bind(userId, endpoint)
        .run();
    },

    /** How many "Send a test" tries this person has used. */
    async testsUsed(userId: string) {
      const row = await db
        .prepare('SELECT push_tests FROM users WHERE id = ?')
        .bind(userId)
        .first<{ push_tests: number }>();
      return row?.push_tests ?? 0;
    },

    /**
     * Counts one more test, unless `max` are used already. Resolves with the new count, or null when none are
     * left. Check and count are one statement, so two quick taps can't both take the last test.
     */
    async useTest(userId: string, max: number) {
      const row = await db
        .prepare(
          'UPDATE users SET push_tests = push_tests + 1 WHERE id = ? AND push_tests < ? RETURNING push_tests',
        )
        .bind(userId, max)
        .first<{ push_tests: number }>();
      return row?.push_tests ?? null;
    },

    /** Drops subscriptions the push service says are gone (the browser unsubscribed or was wiped). */
    async forget(endpoints: string[]) {
      if (!endpoints.length) return;
      await db.batch(
        endpoints.map(e => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(e)),
      );
    },

    /** Every subscription with the live workspaces its person belongs to: who the daily reminders go to. */
    audiences() {
      return all<Subscription & { workspace_id: string; user_id: string; email: string }>(
        db,
        `SELECT m.workspace_id, u.id AS user_id, u.email, s.endpoint, s.p256dh, s.auth
        FROM push_subscriptions s JOIN users u ON u.id = s.user_id
        JOIN workspace_members m ON m.user_id = u.id
        JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
        ORDER BY m.workspace_id`,
      );
    },
  };
}
