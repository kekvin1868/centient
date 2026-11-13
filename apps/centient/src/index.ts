// Worker entry: HTTP requests go to the app; the daily cron sends bill reminders. Static files are served by
// Workers assets before this runs.
import { app } from './app';
import type { Env } from './context';
import { remindDue } from './cron';

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(remindDue(env, Date.now()));
  },
};
