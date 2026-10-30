// /api/budgets
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { currency, day, id, json, money, query } from '../../lib/schemas';

export const budgetsRoutes = new Hono<AppEnv>()
  .get('/', query(z.object({ day: day.optional() })), async c =>
    c.json(await c.var.services.budgets.status(c.req.valid('query').day)))

  .get('/history', async c => c.json(await c.var.services.budgets.history()))

  // `startsOn` + `days` make it a temporary budget (`id` changes one); the service checks the range and the dates.
  .put('/', json(z.object({ categoryId: id.nullish(), envelopeId: id.nullish(), currency: currency.optional(), limit: money, startsOn: day.optional(), days: z.number().optional(), id: id.optional() })), async c =>
    c.json({ id: await c.var.services.budgets.set(c.req.valid('json')) }))

  .delete('/:id', async c => {
    await c.var.services.budgets.remove(c.req.param('id'));
    return c.json({ ok: true });
  });
