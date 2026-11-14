// Tickets: a save that carries an `Idempotency-Key` header is taken once. The phone keeps entry changes while
// it has no signal and sends them later; when an answer is lost on the way back it sends the same save again,
// with the same ticket, and gets the first answer instead of a second entry.
// - Known ticket, same request: the first answer again, nothing runs.
// - Known ticket, another request: refused (TICKET_REUSED), never merged.
// - New ticket: the handler runs, and the ticket is written inside the handler's own batch (repos.ride), so the
//   save and its ticket land together or not at all. Two copies arriving at once: one batch wins, the other
//   fails on the ticket's primary key, writes nothing, and is answered from the winner's row.
// Only a save that worked is remembered: a refusal wrote nothing, and its reason may be gone on the next try.
// ponytail: a handler that writes without repos.batch gets its ticket after it answers (not atomic).
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../context';
import type { Ticket } from '../repos/tickets';

/** How long a ticket is remembered; the daily job (src/cron.ts) forgets older ones. */
export const TICKET_DAYS = 30;
const MAX_ANSWER = 8000; // a longer answer is not kept; the repeat gets a plain "saved"

const hex = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

function again(c: Context<AppEnv>, t: Ticket) {
  return c.body(t.response ?? JSON.stringify({ ok: true, replayed: true }), {
    status: (t.status ?? 200) as 200,
    headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' },
  });
}

export const ticket = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const key = c.req.header('Idempotency-Key');
  if (!key || c.req.method === 'GET') return next();
  if (key.length > 80)
    return c.json({ code: 'VALIDATION', message: 'Idempotency-Key: 80 characters at most' }, 400);
  const { ws, repos } = c.var;
  const url = new URL(c.req.url);
  const request = `${c.req.method} ${url.pathname}${url.search} ${await hex(await c.req.raw.clone().text())}`;
  const reused = () =>
    c.json({ code: 'TICKET_REUSED', message: 'That ticket was used for another save' }, 422);

  const known = await repos.tickets.get(ws, key);
  if (known) return known.request === request ? again(c, known) : reused();

  repos.ride(repos.tickets.claim(ws, key, request));
  await next();
  if (c.res.ok) {
    const text = await c.res.clone().text();
    await repos.tickets.answer(
      ws,
      key,
      request,
      c.res.status,
      text.length > MAX_ANSWER ? null : text,
    );
    return;
  }
  // Refused or failed. When another copy of this save took the ticket meanwhile, this one wrote nothing:
  // answer it from that copy.
  const winner = await repos.tickets.get(ws, key);
  if (winner) c.res = winner.request === request ? again(c, winner) : reused();
};
