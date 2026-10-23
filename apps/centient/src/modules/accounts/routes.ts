// /api/accounts
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { accountKinds, currency, id, json, patch, text } from '../../lib/schemas';

export const accountsRoutes = new Hono<AppEnv>()
  .post('/', json(z.object({
    name: text(60).min(1), kind: z.enum(accountKinds), provider: text(30).nullish(), currency: currency.optional(),
    dueDay: z.number().int().min(1).max(31).nullish(), openingBalance: z.number().int().optional(),
  })), async c => c.json(await c.var.services.accounts.create(c.req.valid('json')), 201))

  .post('/:id/balance', json(z.object({ actual: z.number().int(), categoryId: id.nullish() })), async c =>
    c.json(await c.var.services.accounts.reconcile(c.req.param('id'), c.req.valid('json'))))

  .patch('/:id', json(patch), async c => {
    await c.var.services.accounts.update(c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  .delete('/:id', async c => {
    await c.var.services.accounts.remove(c.req.param('id'));
    return c.json({ ok: true });
  });
