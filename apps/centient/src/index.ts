// Worker entry: HTTP requests go to the app; the daily cron sends bill reminders and forgets old tickets. Static
// files are served by Workers assets before this runs.
import { app } from './app';
import type { Env } from './context';
import { remindDue } from './cron';
import { TICKET_DAYS } from './middleware/ticket';
import { ticketsRepo } from './repos/tickets';

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(remindDue(env, Date.now()));
    ctx.waitUntil(
      ticketsRepo(env.DB).sweep(new Date(Date.now() - TICKET_DAYS * 86_400_000).toISOString()),
    );
  },
};
