// The Worker's HTTP app: sign-in and services for every /api request, then one sub-app per module.
// Routes are chained so `AppType` carries every route's input and output types for the typed client (hono/client).
import { Hono } from 'hono';
import type { AppEnv } from './context';
import { auth } from './middleware/auth';
import { onError } from './middleware/errors';
import { init } from './middleware/init';
import { accountsRoutes } from './modules/accounts/routes';
import { budgetsRoutes } from './modules/budgets/routes';
import { categoriesRoutes } from './modules/categories/routes';
import { installmentsRoutes } from './modules/installments/routes';
import { ledgerRoutes } from './modules/ledger/routes';
import { pocketsRoutes } from './modules/pockets/routes';
import { quickaddRoutes } from './modules/quickadd/routes';
import { workspaceRoutes } from './modules/workspace/routes';

export const app = new Hono<AppEnv>();

app.onError(onError);
app.use('/api/*', auth(), init());

const routes = app
  .route('/api', workspaceRoutes)
  .route('/api', ledgerRoutes)
  .route('/api/accounts', accountsRoutes)
  .route('/api/envelopes', pocketsRoutes)
  .route('/api/categories', categoriesRoutes)
  .route('/api/budgets', budgetsRoutes)
  .route('/api/quickadd', quickaddRoutes)
  .route('/api', installmentsRoutes);

app.all('/api/*', c => c.json({ code: 'NOT_FOUND', message: 'No such endpoint' }, 404));

export type AppType = typeof routes;
