// /api/categories
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { id, json, patch, text } from '../../lib/schemas';

export const categoriesRoutes = new Hono<AppEnv>()
  .post('/', json(z.object({ name: text(60).min(1), kind: z.enum(['EXPENSE', 'INCOME']) })), async c =>
    c.json(await c.var.services.categories.create(c.req.valid('json')), 201))

  .patch('/:id', json(patch), async c => {
    await c.var.services.categories.update(c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  .delete('/:id', json(z.object({ moveTo: id })), async c => {
    await c.var.services.categories.remove(c.req.param('id'), c.req.valid('json').moveTo);
    return c.json({ ok: true });
  });
