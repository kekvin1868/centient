// /api/budgets
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { currency, day, id, json, money, query } from '../../lib/schemas';

export const budgetsRoutes = new Hono<AppEnv>()
  .get('/', query(z.object({ day: day.optional() })), async c =>
    c.json(await c.var.services.budgets.status(c.req.valid('query').day)))

  .put('/', json(z.object({ categoryId: id.nullish(), envelopeId: id.nullish(), currency: currency.optional(), limit: money })), async c =>
    c.json({ id: await c.var.services.budgets.set(c.req.valid('json')) }))

  .delete('/:id', async c => {
    await c.var.services.budgets.remove(c.req.param('id'));
    return c.json({ ok: true });
  });
