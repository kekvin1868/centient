// /api/transactions, /api/entries, /api/balances
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { command, day, id, json, query } from '../../lib/schemas';

const txQuery = z.object({
  from: day.optional(), to: day.optional(), account: id.optional(), envelope: id.optional(), category: id.optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ALLOCATE']).optional(), cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const toFilter = (q: z.infer<typeof txQuery>) => ({
  from: q.from, to: q.to, accountId: q.account, envelopeId: q.envelope, categoryId: q.category, type: q.type, cursor: q.cursor, limit: q.limit,
});

export const ledgerRoutes = new Hono<AppEnv>()
  // One command, or { commands: [...] } for several in one atomic write. Returns entry ids.
  .post('/transactions', json(z.union([z.object({ commands: z.array(command).min(1).max(50) }), command])), async c => {
    const body = c.req.valid('json');
    return c.json({ ids: await c.var.services.ledger.record('commands' in body ? body.commands : [body]) }, 201);
  })

  .get('/transactions', query(txQuery), async c => c.json(await c.var.services.ledger.listTransactions(toFilter(c.req.valid('query')))))

  .get('/entries', query(txQuery), async c => c.json(await c.var.services.ledger.listEntries(toFilter(c.req.valid('query')))))

  .patch('/entries/:id', json(command), async c => {
    await c.var.services.ledger.edit(c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  .patch('/entries/:id/icon', json(z.object({ icon: z.string().max(16).nullable(), forMerchant: z.boolean().default(true) })), async c => {
    await c.var.services.ledger.setIcon(c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  .delete('/entries/:id', async c => {
    await c.var.services.ledger.remove(c.req.param('id'));
    return c.json({ ok: true });
  })

  .get('/balances', async c => c.json(await c.var.services.ledger.balances()));
