// HTTP interface: Hono routes, Zod at the boundary, errors mapped to { code, message }.
// Routes are chained so `AppType` carries every route's input and output types for the typed client (hono/client).
import { DECIMALS } from '@centient/money';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z, ZodError } from 'zod';
import * as uc from '../application/usecases';
import { cycleStart, jakartaToday, nextCycleStart } from '../domain/cycle';
import { DomainError } from '../domain/ledger';
import { D1Catalog, D1Ledger } from '../infrastructure/d1';
import { identify, type AuthEnv } from './auth';

export type Env = AuthEnv & { DB: D1Database };
type Vars = { ws: string; deps: uc.Deps };

const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max);

const command = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('EXPENSE'), accountId: id, envelopeId: id.optional(), categoryId: id, amount: money, date: day,
    merchant: text(120).optional(), note: text(500).optional(),
    split: z.object({ people: z.number().int().min(2).max(50), iouAccountId: id }).optional(),
    originalAmount: money.optional(), originalCurrency: z.string().max(8).optional(),
  }),
  z.object({
    type: z.literal('INCOME'), accountId: id, envelopeId: id.optional(), categoryId: id, amount: money, date: day,
    merchant: text(120).optional(), note: text(500).optional(),
  }),
  z.object({
    type: z.literal('TRANSFER'), fromAccountId: id, toAccountId: id, amount: money, toAmount: money.optional(),
    fromEnvelopeId: id.optional(), toEnvelopeId: id.optional(), fee: money.optional(), date: day, note: text(500).optional(),
  }),
  z.object({ type: z.literal('ALLOCATE'), fromEnvelopeId: id, toEnvelopeId: id, amount: money, date: day, note: text(500).optional() }),
]);

const accountKinds = ['BANK', 'EWALLET', 'CASH', 'CREDIT_CARD', 'PAYLATER', 'EXCHANGE', 'IOU'] as const;
const currency = z.enum(Object.keys(DECIMALS) as [string, ...string[]]);

const txQuery = z.object({
  from: day.optional(), to: day.optional(), account: id.optional(), envelope: id.optional(), category: id.optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ALLOCATE']).optional(), cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const toFilter = (q: z.infer<typeof txQuery>) => ({
  from: q.from, to: q.to, accountId: q.account, envelopeId: q.envelope, categoryId: q.category, type: q.type, cursor: q.cursor, limit: q.limit,
});

const patch = z.object({
  name: text(60).min(1).optional(), kind: z.enum(accountKinds).optional(), provider: text(30).nullable().optional(), currency_code: currency.optional(),
  default_envelope_id: id.nullable().optional(), due_day: z.number().int().min(1).max(31).nullable().optional(),
  target_amount: money.nullable().optional(), target_date: day.nullable().optional(), archived: z.boolean().optional(),
});

// Zod errors thrown here reach onError as VALIDATION; a body that is not JSON parses as {}.
const json = <T extends z.ZodType>(schema: T) => validator('json', (v): z.infer<T> => schema.parse(v));
const query = <T extends z.ZodType>(schema: T) => validator('query', (v): z.infer<T> => schema.parse(v));

export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('/api/*', async (c, next) => {
  const email = await identify(c.req.raw, c.env);
  if (!email) return c.json({ code: 'UNAUTHORIZED', message: 'Sign in through Cloudflare Access' }, 401);
  const deps: uc.Deps = { catalog: new D1Catalog(c.env.DB), ledger: new D1Ledger(c.env.DB) };
  c.set('deps', deps);
  c.set('ws', (await deps.catalog.ensureWorkspace(email)).workspaceId);
  await next();
});

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ code: 'VALIDATION', message: err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
  if (err instanceof DomainError) return c.json({ code: err.code, message: err.message }, err.code === 'NOT_FOUND' ? 404 : 400);
  if (err instanceof HTTPException && err.status === 400) return c.json({ code: 'VALIDATION', message: err.message }, 400);
  const msg = String(err instanceof Error ? err.message : err);
  if (msg.includes('CATEGORY_LIMIT')) return c.json({ code: 'CATEGORY_LIMIT', message: '200 active categories is the maximum' }, 409);
  if (msg.includes('UNIQUE constraint')) return c.json({ code: 'DUPLICATE', message: 'That name is already used' }, 409);
  console.error(err);
  return c.json({ code: 'INTERNAL', message: 'Something went wrong' }, 500);
});

const routes = app
  .get('/api/me', async c => {
    const w = await c.var.deps.catalog.getWorkspace(c.var.ws);
    const today = jakartaToday();
    const from = cycleStart(today, w.cycle_start_day);
    return c.json({ workspace: w, today, cycle: { from, to: nextCycleStart(from, w.cycle_start_day) }, currencies: DECIMALS });
  })

  .patch('/api/workspace', json(z.object({ name: text(80).min(1).optional(), cycle_start_day: z.number().int().min(1).max(31).optional() })), async c => {
    await c.var.deps.catalog.updateWorkspace(c.var.ws, c.req.valid('json'));
    return c.json({ ok: true });
  })

  .get('/api/catalog', async c => {
    const { catalog } = c.var.deps;
    const [accounts, envelopes, categories] = await Promise.all([catalog.listAccounts(c.var.ws), catalog.listEnvelopes(c.var.ws), catalog.listCategories(c.var.ws)]);
    return c.json({ accounts, envelopes, categories });
  })

  .post('/api/accounts', json(z.object({
    name: text(60).min(1), kind: z.enum(accountKinds), provider: text(30).nullish(), currency: currency.optional(),
    dueDay: z.number().int().min(1).max(31).nullish(), defaultEnvelopeId: id.nullish(),
    openingBalance: z.number().int().optional(), openingEnvelopeId: id.optional(),
  })), async c => c.json(await uc.createAccount(c.var.deps, c.var.ws, c.req.valid('json')), 201))

  .post('/api/accounts/:id/balance', json(z.object({ actual: z.number().int(), categoryId: id.nullish() })), async c =>
    c.json(await uc.updateBalance(c.var.deps, c.var.ws, c.req.param('id'), c.req.valid('json'))))

  .delete('/api/accounts/:id', async c => {
    await uc.deleteAccount(c.var.deps, c.var.ws, c.req.param('id'));
    return c.json({ ok: true });
  })

  .get('/api/backup', async c => c.json(await uc.backup(c.var.deps, c.var.ws)))

  .post('/api/workspace/reset', async c => {
    await uc.resetWorkspace(c.var.deps, c.var.ws);
    return c.json({ ok: true });
  })

  .post('/api/envelopes', json(z.object({
    name: text(60).min(1), kind: z.enum(['SPENDING', 'SAVINGS', 'GOAL']).default('SPENDING'), currency: currency.default('IDR'),
    targetAmount: money.nullish(), targetDate: day.nullish(),
  })), async c => {
    const i = c.req.valid('json');
    if ((i.kind === 'GOAL') !== Boolean(i.targetAmount)) throw new DomainError('GOAL_TARGET', 'A goal needs a target amount; other kinds must not have one');
    return c.json(await c.var.deps.catalog.createEnvelope(c.var.ws, {
      name: i.name, kind: i.kind, currency_code: i.currency, target_amount: i.targetAmount ?? null, target_date: i.kind === 'GOAL' ? i.targetDate ?? null : null,
    }), 201);
  })

  .post('/api/categories', json(z.object({ name: text(60).min(1), kind: z.enum(['EXPENSE', 'INCOME']) })), async c =>
    c.json(await c.var.deps.catalog.createCategory(c.var.ws, c.req.valid('json')), 201))

  .patch('/api/:table{accounts|envelopes|categories}/:id', json(patch), async c => {
    const table = c.req.param('table') as 'accounts' | 'envelopes' | 'categories';
    await uc.updateItem(c.var.deps, c.var.ws, table, c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  // One command, or { commands: [...] } for several in one atomic write. Returns entry ids.
  .post('/api/transactions', json(z.union([z.object({ commands: z.array(command).min(1).max(50) }), command])), async c => {
    const body = c.req.valid('json');
    const cmds = 'commands' in body ? body.commands : [body];
    return c.json({ ids: await uc.recordTransactions(c.var.deps, c.var.ws, cmds) }, 201);
  })

  .get('/api/transactions', query(txQuery), async c => c.json(await uc.listTransactions(c.var.deps, c.var.ws, toFilter(c.req.valid('query')))))

  .get('/api/entries', query(txQuery), async c => c.json(await uc.listEntries(c.var.deps, c.var.ws, toFilter(c.req.valid('query')))))

  .patch('/api/entries/:id', json(command), async c => {
    await uc.editEntry(c.var.deps, c.var.ws, c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  .delete('/api/entries/:id', async c => {
    await uc.deleteEntry(c.var.deps, c.var.ws, c.req.param('id'));
    return c.json({ ok: true });
  })

  .get('/api/balances', async c => c.json(await uc.getBalances(c.var.deps, c.var.ws)))

  .get('/api/budgets', query(z.object({ day: day.optional() })), async c =>
    c.json(await uc.getBudgetStatus(c.var.deps, c.var.ws, c.req.valid('query').day)))

  .put('/api/budgets', json(z.object({ categoryId: id.nullish(), envelopeId: id.nullish(), limit: money })), async c =>
    c.json({ id: await uc.setBudget(c.var.deps, c.var.ws, c.req.valid('json')) }))

  .delete('/api/budgets/:id', async c => {
    if (!(await c.var.deps.catalog.deleteBudget(c.var.ws, c.req.param('id')))) throw new DomainError('NOT_FOUND', 'Budget not found');
    return c.json({ ok: true });
  })

  .get('/api/quickadd/context', async c => c.json(await uc.quickContext(c.var.deps, c.var.ws)))

  .post('/api/quickadd/parse', json(z.object({ text: text(1000).min(1) })), async c =>
    c.json({ drafts: await uc.quickParse(c.var.deps, c.var.ws, c.req.valid('json').text) }))

  .post('/api/quickadd/save', json(z.object({
    items: z.array(z.object({ command, rawMerchant: text(120).optional(), suggestedMerchant: text(120).optional() })).min(1).max(50),
  })), async c => c.json({ ids: await uc.quickSave(c.var.deps, c.var.ws, c.req.valid('json').items) }, 201))

  .get('/api/export.csv', async c => {
    const csv = await uc.exportCsv(c.var.deps, c.var.ws);
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"' });
  });

app.all('/api/*', c => c.json({ code: 'NOT_FOUND', message: 'No such endpoint' }, 404));

export type AppType = typeof routes;
