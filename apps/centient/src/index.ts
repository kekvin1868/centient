// Worker entry: HTTP requests go to the app; the daily cron (src/cron.ts) posts installment interest, sends bill
// reminders and forgets old tickets. Static files are served by Workers assets before this runs.
// In dev, `GET /cdn-cgi/local/scheduled?time=<ms>` runs the cron as of that moment (Miniflare, via the Vite plugin).
import { app } from './app';
import type { Env } from './context';
import { forgetTickets, postInterest, remindDue } from './cron';

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = event.scheduledTime;
    ctx.waitUntil(postInterest(env, now).then(() => remindDue(env, now)));
    ctx.waitUntil(forgetTickets(env, now));
  },
};
