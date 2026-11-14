// Worker entry: HTTP requests go to the app; the daily cron (src/cron.ts) sends bill reminders and forgets old
// tickets. Static files are served by Workers assets before this runs.
import { app } from './app';
import type { Env } from './context';
import { forgetTickets, remindDue } from './cron';

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = Date.now();
    ctx.waitUntil(remindDue(env, now));
    ctx.waitUntil(forgetTickets(env, now));
  },
};
