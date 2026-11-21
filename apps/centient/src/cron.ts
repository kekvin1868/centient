// The Worker's daily job (wrangler.toml `[triggers]`, 08:00 in Jakarta): installment interest posted on the card
// bills that closed, bill reminders by Web Push, and old tickets forgotten. Like
// middleware/init.ts for a request, this is where bindings are read and services are built, once per workspace.
import type { Env } from './context';
import { addDays, jakartaToday } from './domain/cycle';
import { dueNotes, REMIND_DAYS_AHEAD } from './domain/reminders';
import { createCatalog } from './lib/catalog';
import { createRepos, createServices } from './middleware/init';
import { createInstallmentsService } from './modules/installments/service';
import { createLedgerService } from './modules/ledger/service';
import { TICKET_DAYS } from './middleware/ticket';
import { createSender, vapidOf } from './modules/push/sender';
import { r2Files } from './repos/files';
import { ticketsRepo } from './repos/tickets';

/**
 * Sends today's reminders to every subscribed browser of every workspace with a bill due today or in three
 * days. Returns how many notifications went out. Does nothing when the server has no VAPID keys.
 */
export async function remindDue(
  env: Env,
  now: number,
  fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init),
): Promise<number> {
  const vapid = vapidOf(env);
  if (!vapid) return 0;
  const sender = createSender(vapid, fetch);
  const repos = createRepos(env.DB, env.FILES && r2Files(env.FILES));
  const today = jakartaToday(now);
  const audiences = await repos.push.audiences();
  let sent = 0;
  for (const ws of new Set(audiences.map(a => a.workspace_id))) {
    const subscriptions = audiences.filter(a => a.workspace_id === ws);
    const [{ user_id, email }] = subscriptions;
    const services = createServices({
      repos,
      ws,
      user: { id: user_id, email },
      now: () => now,
      fetch,
      sender,
    });
    const [list, { accounts }] = await Promise.all([
      services.recurring.list(),
      services.workspace.catalog(),
    ]);
    const cards = list.cards.map(c => {
      const account = accounts.find(a => a.id === c.accountId);
      return { ...c, name: account?.name ?? 'Card', currency: account?.currency_code ?? 'IDR' };
    });
    for (const note of dueNotes(list.items, cards, today, addDays(today, REMIND_DAYS_AHEAD))) {
      const gone = await sender.send(subscriptions, { ...note, url: '/' });
      await repos.push.forget(gone);
      sent += subscriptions.length - gone.length;
    }
  }
  return sent;
}

/**
 * Posts the interest of every installment slice whose card bill has closed, in every workspace with a plan that
 * charges interest. Runs before the reminders so they remind the bill with it. Returns how many lines it posted.
 */
export async function postInterest(env: Env, now: number): Promise<number> {
  const repos = createRepos(env.DB);
  let posted = 0;
  for (const ws of await repos.installments.withInterest()) {
    const base = { ws, now: () => now, repos, catalog: createCatalog(ws, repos) };
    const installments = createInstallmentsService({ ...base, ledger: createLedgerService(base) });
    posted += await installments.postInterest();
  }
  return posted;
}

/** Forgets tickets older than TICKET_DAYS (middleware/ticket.ts), in every workspace; returns how many. */
export function forgetTickets(env: Env, now: number) {
  return ticketsRepo(env.DB).sweep(new Date(now - TICKET_DAYS * 86_400_000).toISOString());
}
