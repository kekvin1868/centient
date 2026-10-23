// /api/envelopes: pockets inside an account.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { day, hex, id, json, money, patch, text } from '../../lib/schemas';

export const pocketsRoutes = new Hono<AppEnv>()
  .post('/', json(z.object({
    accountId: id, name: text(60).min(1), kind: z.enum(['SPENDING', 'SAVINGS', 'GOAL']).default('SPENDING'),
    targetAmount: money.nullish(), targetDate: day.nullish(), color: hex.nullish(),
  })), async c => c.json(await c.var.services.pockets.create(c.req.valid('json')), 201))

  .patch('/:id', json(patch), async c => {
    await c.var.services.pockets.update(c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  });
