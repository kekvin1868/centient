// Types shared by the app, the middleware and every module.
import type { Catalog } from './lib/catalog';
import type { AuthEnv } from './middleware/auth';
import type { Repos, Services } from './middleware/init';

export type Env = AuthEnv & { DB: D1Database; FILES?: R2Bucket };
export type AppEnv = { Bindings: Env; Variables: { email: string; services: Services } };

/** What every service is built with: the request's workspace (from the session, never from input), the clock, data access. */
export type ServiceDeps = { ws: string; now: () => number; repos: Repos; catalog: Catalog };
