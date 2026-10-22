// HTTP interface: Hono routes, Zod at the boundary, errors mapped to { code, message }.
// Routes are chained so `AppType` carries every route's input and output types for the typed client (hono/client).
import { DECIMALS } from '@centient/money';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { z, ZodError } from 'zod';
import * as inst from '../application/installments';
import * as uc from '../application/usecases';
import { cycleStart, jakartaToday, nextCycleStart } from '../domain/cycle';
import { DomainError } from '../domain/ledger';
import { D1Catalog, D1Installments, D1Ledger, D1Prices } from '../infrastructure/d1';
import { R2Files } from '../infrastructure/r2';
import { identify, type AuthEnv } from './auth';

export type Env = AuthEnv & { DB: D1Database; FILES: R2Bucket };
type Vars = { ws: string; deps: uc.Deps };

const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.number().int().positive();
const text = (max: number) => z.string().trim().max(max);

const command = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('EXPENSE'), accountId: id, envelopeId: id.optional(), categoryId: id, amount: money, date: day,
    merchant: text(120).optional(), note: text(500).optional(),
    split: z.object({ people: z.number().int().min(2).max(50), iouAccountId: id.optional() }).optional(),
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

const accountKinds = ['BANK', 'DEBIT_CARD', 'EWALLET', 'CASH', 'CREDIT_CARD', 'PAYLATER', 'EXCHANGE', 'IOU'] as const;
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
  const deps: uc.Deps = {
    catalog: new D1Catalog(c.env.DB), ledger: new D1Ledger(c.env.DB), prices: new D1Prices(c.env.DB),
    installments: new D1Installments(c.env.DB), files: c.env.FILES ? new R2Files(c.env.FILES) : undefined,
  };
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

  .patch('/api/workspace', json(z.object({ name: text(80).min(1).optional(), cycle_start_day: z.number().int().min(1).max(31).optional(), onboarded: z.literal(true).optional() })), async c => {
    const { onboarded, ...rest } = c.req.valid('json');
    await c.var.deps.catalog.updateWorkspace(c.var.ws, { ...rest, onboarded_at: onboarded ? new Date().toISOString() : undefined });
    return c.json({ ok: true });
  })

  .get('/api/catalog', async c => {
    const { catalog } = c.var.deps;
    const [accounts, envelopes, categories] = await Promise.all([catalog.listAccounts(c.var.ws), catalog.listEnvelopes(c.var.ws), catalog.listCategories(c.var.ws)]);
    return c.json({ accounts, envelopes, categories });
  })

  .post('/api/accounts', json(z.object({
    name: text(60).min(1), kind: z.enum(accountKinds), provider: text(30).nullish(), currency: currency.optional(),
    dueDay: z.number().int().min(1).max(31).nullish(), openingBalance: z.number().int().optional(),
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

  // A pocket inside an account.
  .post('/api/envelopes', json(z.object({
    accountId: id, name: text(60).min(1), kind: z.enum(['SPENDING', 'SAVINGS', 'GOAL']).default('SPENDING'),
    targetAmount: money.nullish(), targetDate: day.nullish(),
  })), async c => c.json(await uc.createPocket(c.var.deps, c.var.ws, c.req.valid('json')), 201))

  .delete('/api/categories/:id', json(z.object({ moveTo: id })), async c => {
    await uc.deleteCategory(c.var.deps, c.var.ws, c.req.param('id'), c.req.valid('json').moveTo);
    return c.json({ ok: true });
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
  .get('/api/prices', async c => c.json(await uc.getPrices(c.var.deps, c.var.ws)))

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

  .get('/api/installments', query(z.object({ account: id.optional() })), async c =>
    c.json({ plans: await inst.listPlans(c.var.deps, c.var.ws, c.req.valid('query').account) }))

  .post('/api/installments', json(z.object({
    accountId: id, name: text(80).min(1), amountPerInstallment: money, installments: z.number().int().min(1).max(60), firstDue: day,
    paidCount: z.number().int().min(0).max(59), myShare: z.number().int().min(0),
    others: z.array(z.object({ name: text(60).min(1), iouAccountId: id.optional(), share: money })).max(9),
    alreadyInBalance: z.boolean(), categoryId: id.optional(),
  })), async c => c.json(await inst.createPlan(c.var.deps, c.var.ws, c.req.valid('json')), 201))

  .delete('/api/installments/:id', async c => {
    await inst.deletePlan(c.var.deps, c.var.ws, c.req.param('id'));
    return c.json({ ok: true });
  })

  .post('/api/installments/:id/payments', json(z.object({
    no: z.number().int().min(1), seq: z.number().int().min(0), fromAccountId: id.optional(), date: day.optional(),
  })), async c => {
    const { no, seq, ...rest } = c.req.valid('json');
    return c.json(await inst.markPaid(c.var.deps, c.var.ws, c.req.param('id'), no, seq, rest));
  })

  .delete('/api/installments/:id/payments/:no/:seq', async c =>
    c.json(await inst.unmarkPaid(c.var.deps, c.var.ws, c.req.param('id'), Number(c.req.param('no')), Number(c.req.param('seq')))))

  // multipart/form-data with one `file` field.
  .post('/api/installments/:id/payments/:no/:seq/proof', validator('form', v => z.object({ file: z.instanceof(File) }).parse(v)), async c => {
    const { file } = c.req.valid('form');
    return c.json(await inst.attachProof(c.var.deps, c.var.ws, c.req.param('id'), Number(c.req.param('no')), Number(c.req.param('seq')),
      { name: file.name, type: file.type, bytes: await file.arrayBuffer() }));
  })

  .delete('/api/installments/:id/payments/:no/:seq/proof', async c =>
    c.json(await inst.removeProof(c.var.deps, c.var.ws, c.req.param('id'), Number(c.req.param('no')), Number(c.req.param('seq')))))

  // Private files, served only to their workspace; never cached by shared caches.
  .get('/api/files/:id', async c => {
    const f = await inst.getFile(c.var.deps, c.var.ws, c.req.param('id'));
    return c.body(f.body as ReadableStream, 200, {
      'Content-Type': f.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${f.filename.replace(/["\\\r\n]/g, '_')}"`,
    });
  })

  .get('/api/export.csv', async c => {
    const csv = await uc.exportCsv(c.var.deps, c.var.ws);
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"' });
  });

app.all('/api/*', c => c.json({ code: 'NOT_FOUND', message: 'No such endpoint' }, 404));

export type AppType = typeof routes;
