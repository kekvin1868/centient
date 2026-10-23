// Composition root: the only place that reads bindings and builds repos and services. Services are built
// per request (Workers reuse an isolate across requests, so nothing request-related lives at module level).
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../context';
import { createCatalog } from '../lib/catalog';
import { createAccountsService } from '../modules/accounts/service';
import { createBudgetsService } from '../modules/budgets/service';
import { createCategoriesService } from '../modules/categories/service';
import { createInstallmentsService } from '../modules/installments/service';
import { createLedgerService } from '../modules/ledger/service';
import { createPocketsService } from '../modules/pockets/service';
import { createQuickaddService } from '../modules/quickadd/service';
import { createWorkspaceService } from '../modules/workspace/service';
import { accountsRepo } from '../repos/accounts';
import { aliasesRepo } from '../repos/aliases';
import { budgetsRepo } from '../repos/budgets';
import { categoriesRepo } from '../repos/categories';
import { entriesRepo } from '../repos/entries';
import { envelopesRepo } from '../repos/envelopes';
import { filesRepo, r2Files, type FileStore } from '../repos/files';
import { installmentsRepo } from '../repos/installments';
import { pricesRepo } from '../repos/prices';
import { workspacesRepo } from '../repos/workspaces';

export function createRepos(db: D1Database, store?: FileStore) {
  return {
    workspaces: workspacesRepo(db), accounts: accountsRepo(db), envelopes: envelopesRepo(db), categories: categoriesRepo(db),
    aliases: aliasesRepo(db), budgets: budgetsRepo(db), entries: entriesRepo(db), prices: pricesRepo(db),
    installments: installmentsRepo(db), files: filesRepo(db, store),
    /** One atomic write across repos (D1 runs a batch as one transaction). */
    batch: (stmts: D1PreparedStatement[]) => db.batch(stmts),
  };
}
export type Repos = ReturnType<typeof createRepos>;

/** One workspace's services. Lower ones are passed into higher ones (ledger into quick add, installments, workspace). */
export function createServices(o: { repos: Repos; ws: string; now: () => number; fetch: typeof globalThis.fetch }) {
  const base = { ws: o.ws, now: o.now, repos: o.repos, catalog: createCatalog(o.ws, o.repos) };
  const ledger = createLedgerService(base);
  return {
    ledger,
    accounts: createAccountsService(base),
    pockets: createPocketsService(base),
    categories: createCategoriesService(base),
    budgets: createBudgetsService(base),
    quickadd: createQuickaddService({ ...base, ledger }),
    installments: createInstallmentsService({ ...base, ledger }),
    workspace: createWorkspaceService({ ...base, ledger, fetch: o.fetch }),
  };
}
export type Services = ReturnType<typeof createServices>;

export const init = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const repos = createRepos(c.env.DB, c.env.FILES && r2Files(c.env.FILES));
  const { workspaceId } = await repos.workspaces.ensure(c.var.email);
  c.set('services', createServices({ repos, ws: workspaceId, now: Date.now, fetch: (input, init) => fetch(input, init) }));
  await next();
};
