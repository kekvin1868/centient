// Tickets: the saves this workspace has already taken, by the code each one carried (middleware/ticket.ts).
export type Ticket = { request: string; status: number | null; response: string | null };

export function ticketsRepo(db: D1Database) {
  return {
    async get(ws: string, key: string) {
      return db
        .prepare('SELECT request, status, response FROM tickets WHERE workspace_id = ? AND key = ?')
        .bind(ws, key)
        .first<Ticket>();
    },

    /** The statement that takes a ticket. It rides in the save's own batch: a ticket already taken fails all of it. */
    claim: (ws: string, key: string, request: string) =>
      db
        .prepare('INSERT INTO tickets (workspace_id, key, request) VALUES (?, ?, ?)')
        .bind(ws, key, request),

    /** Keeps the answer of a finished save (also takes the ticket, for a save that wrote without a batch). */
    async answer(
      ws: string,
      key: string,
      request: string,
      status: number,
      response: string | null,
    ) {
      await db
        .prepare(
          `INSERT INTO tickets (workspace_id, key, request, status, response) VALUES (?1, ?2, ?3, ?4, ?5)
          ON CONFLICT (workspace_id, key) DO UPDATE SET status = ?4, response = ?5`,
        )
        .bind(ws, key, request, status, response)
        .run();
    },

    /** Forgets tickets taken before `before` (an ISO time), in every workspace; returns how many. */
    async sweep(before: string) {
      const r = await db
        .prepare('DELETE FROM tickets WHERE created_at < datetime(?)')
        .bind(before)
        .run();
      return r.meta.changes;
    },
  };
}
