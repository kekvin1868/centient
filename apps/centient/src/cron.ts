// The Worker's daily job (wrangler.toml `[triggers]`, 08:00 in Jakarta): bill reminders by Web Push. Like
// middleware/init.ts for a request, this is where bindings are read and services are built, once per workspace.
import type { Env } from './context';
import { addDays, jakartaToday } from './domain/cycle';
import { dueNotes, REMIND_DAYS_AHEAD } from './domain/reminders';
import { createRepos, createServices } from './middleware/init';
import { createSender, vapidOf } from './modules/push/sender';
import { r2Files } from './repos/files';

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
