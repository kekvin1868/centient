// Composition root: the only place that reads bindings and builds repos and services. Services are built
// per request (Workers reuse an isolate across requests, so nothing request-related lives at module level).
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../context';
import { createCatalog } from '../lib/catalog';
import { createAccountsService } from '../modules/accounts/service';
import { createBudgetsService } from '../modules/budgets/service';
import { createCategoriesService } from '../modules/categories/service';
import { createInboxService } from '../modules/inbox/service';
import { createInstallmentsService } from '../modules/installments/service';
import { createLedgerService } from '../modules/ledger/service';
import { UNLOCK_COOKIE } from '../modules/lock/routes';
import { createLockService } from '../modules/lock/service';
import { createPocketsService } from '../modules/pockets/service';
import { createSender, vapidOf, type Sender } from '../modules/push/sender';
import { createPushService } from '../modules/push/service';
import { createQuickaddService } from '../modules/quickadd/service';
import { createRecurringService } from '../modules/recurring/service';
import { createReportsService } from '../modules/reports/service';
import { createWorkspaceService } from '../modules/workspace/service';
import { accountsRepo } from '../repos/accounts';
import { aliasesRepo } from '../repos/aliases';
import { budgetsRepo } from '../repos/budgets';
import { categoriesRepo } from '../repos/categories';
import { entriesRepo } from '../repos/entries';
import { envelopesRepo } from '../repos/envelopes';
import { filesRepo, r2Files, type FileStore } from '../repos/files';
import { inboxRepo } from '../repos/inbox';
import { installmentsRepo } from '../repos/installments';
import { lockRepo } from '../repos/lock';
import { pricesRepo } from '../repos/prices';
import { purgeRepo } from '../repos/purge';
import { pushRepo } from '../repos/push';
import { recurringRepo } from '../repos/recurring';
import { reportsRepo } from '../repos/reports';
import { workspacesRepo } from '../repos/workspaces';

export function createRepos(db: D1Database, store?: FileStore) {
  return {
    workspaces: workspacesRepo(db),
    accounts: accountsRepo(db),
    envelopes: envelopesRepo(db),
    categories: categoriesRepo(db),
    aliases: aliasesRepo(db),
    budgets: budgetsRepo(db),
    entries: entriesRepo(db),
    prices: pricesRepo(db),
    recurring: recurringRepo(db),
    inbox: inboxRepo(db),
    lock: lockRepo(db),
    purge: purgeRepo(db),
    push: pushRepo(db),
    installments: installmentsRepo(db),
    files: filesRepo(db, store),
    reports: reportsRepo(db),
    /** One atomic write across repos (D1 runs a batch as one transaction). */
    batch: (stmts: D1PreparedStatement[]) => db.batch(stmts),
  };
}
export type Repos = ReturnType<typeof createRepos>;

/**
 * One request's services: one workspace's, plus the signed-in person's own (the app lock). Lower ones are passed
 * into higher ones (ledger into quick add, installments, recurring, inbox, workspace).
 */
export function createServices(o: {
  repos: Repos;
  ws: string;
  user: { id: string; email: string };
  now: () => number;
  fetch: typeof globalThis.fetch;
  /** Sends Web Push; left out when the server has no VAPID keys (and in most tests). */
  sender?: Sender | null;
}) {
  const base = { ws: o.ws, now: o.now, repos: o.repos, catalog: createCatalog(o.ws, o.repos) };
  const ledger = createLedgerService(base);
  const accounts = createAccountsService(base);
  return {
    ledger,
    accounts,
    pockets: createPocketsService(base),
    categories: createCategoriesService(base),
    budgets: createBudgetsService(base),
    reports: createReportsService(base),
    quickadd: createQuickaddService({ ...base, ledger }),
    installments: createInstallmentsService({ ...base, ledger }),
    recurring: createRecurringService({ ...base, ledger }),
    inbox: createInboxService({ ...base, ledger, accounts }),
    workspace: createWorkspaceService({ ...base, ledger, fetch: o.fetch, userId: o.user.id }),
    push: createPushService({ userId: o.user.id, repos: o.repos, sender: o.sender ?? null }),
    lock: createLockService({
      userId: o.user.id,
      email: o.user.email,
      now: o.now,
      repos: o.repos,
    }),
  };
}
export type Services = ReturnType<typeof createServices>;

export const init = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const repos = createRepos(c.env.DB, c.env.FILES && r2Files(c.env.FILES));
  const { userId, workspaceId } = await repos.workspaces.ensure(c.var.email);
  const send: typeof fetch = (input, init) => fetch(input, init);
  const vapid = vapidOf(c.env);
  const services = createServices({
    repos,
    ws: workspaceId,
    user: { id: userId, email: c.var.email },
    now: Date.now,
    fetch: send,
    sender: vapid && createSender(vapid, send),
  });
  c.set('services', services);
  // The app lock: while it is on, a browser without a live unlock session reaches only /api/lock. A service
  // token (the Shortcut) has no screen to unlock on and may only add to the Inbox anyway, so it passes.
  if (
    c.var.identity.via !== 'service' &&
    !c.req.path.startsWith('/api/lock') &&
    !(await services.lock.status(getCookie(c, UNLOCK_COOKIE))).unlocked
  )
    return c.json({ code: 'LOCKED', message: 'Unlock Centient first' }, 423);
  await next();
};
