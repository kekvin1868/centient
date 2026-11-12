// Types shared by the app, the middleware and every module.
import type { Catalog } from './lib/catalog';
import type { AuthEnv, Identity } from './middleware/auth';
import type { Repos, Services } from './middleware/init';

export type Env = AuthEnv & {
  DB: D1Database;
  FILES?: R2Bucket;
  // Web Push (bill reminders): the server's VAPID keys. Without all three, reminders are off.
  VAPID_SUBJECT?: string; // "mailto:you@example.com"
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};
export type AppEnv = {
  Bindings: Env;
  Variables: { email: string; identity: Identity; services: Services };
};

/** What every service is built with: the request's workspace (from the session, never from input), the clock, data access. */
export type ServiceDeps = { ws: string; now: () => number; repos: Repos; catalog: Catalog };
