// App lock rows: a user's passkeys, the challenge a ceremony is answering, and unlock sessions.
import { all, uid } from './sql';

export type Passkey = { id: string; public_key: string; counter: number };

export function lockRepo(db: D1Database) {
  return {
    /** How many passkeys the user has (0 = the lock is off) and whether `sessionId` is theirs and still live. */
    async state(userId: string, sessionId: string, now: string) {
      const r = await db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM passkeys WHERE user_id = ?1) AS passkeys,
            EXISTS (SELECT 1 FROM unlock_sessions WHERE id = ?2 AND user_id = ?1 AND expires_at > ?3) AS session`,
        )
        .bind(userId, sessionId, now)
        .first<{ passkeys: number; session: number }>();
      return { passkeys: r?.passkeys ?? 0, session: Boolean(r?.session) };
    },

    passkeys(userId: string) {
      return all<Passkey>(
        db,
        'SELECT id, public_key, counter FROM passkeys WHERE user_id = ?',
        userId,
      );
    },

    async addPasskey(userId: string, p: Passkey) {
      await db
        .prepare('INSERT INTO passkeys (id, user_id, public_key, counter) VALUES (?, ?, ?, ?)')
        .bind(p.id, userId, p.public_key, p.counter)
        .run();
    },

    async setCounter(id: string, counter: number) {
      await db.prepare('UPDATE passkeys SET counter = ? WHERE id = ?').bind(counter, id).run();
    },

    async setChallenge(userId: string, challenge: string, expiresAt: string) {
      await db
        .prepare(
          `INSERT INTO lock_challenges (user_id, challenge, expires_at) VALUES (?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET challenge = excluded.challenge, expires_at = excluded.expires_at`,
        )
        .bind(userId, challenge, expiresAt)
        .run();
    },

    /** The user's challenge if it has not run out; it is removed either way, so it answers one ceremony. */
    async takeChallenge(userId: string, now: string) {
      const [found] = await db.batch<{ challenge: string }>([
        db
          .prepare('SELECT challenge FROM lock_challenges WHERE user_id = ? AND expires_at > ?')
          .bind(userId, now),
        db.prepare('DELETE FROM lock_challenges WHERE user_id = ?').bind(userId),
      ]);
      return found.results[0]?.challenge ?? null;
    },

    /** Starts an unlock session (and sweeps the user's expired ones); returns its id for the cookie. */
    async startSession(userId: string, now: string, expiresAt: string) {
      const id = uid();
      await db.batch([
        db
          .prepare('DELETE FROM unlock_sessions WHERE user_id = ? AND expires_at <= ?')
          .bind(userId, now),
        db
          .prepare('INSERT INTO unlock_sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
          .bind(id, userId, expiresAt),
      ]);
      return id;
    },

    async endSession(userId: string, sessionId: string) {
      await db
        .prepare('DELETE FROM unlock_sessions WHERE id = ? AND user_id = ?')
        .bind(sessionId, userId)
        .run();
    },

    /** The deletes that turn the lock off: every passkey, session and challenge of the user. */
    clearStatements(userId: string) {
      return ['passkeys', 'unlock_sessions', 'lock_challenges'].map(table =>
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId),
      );
    },
  };
}
