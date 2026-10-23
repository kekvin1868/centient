// /api/quickadd
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { command, json, text } from '../../lib/schemas';

export const quickaddRoutes = new Hono<AppEnv>()
  .get('/context', async c => c.json(await c.var.services.quickadd.context()))

  .post('/parse', json(z.object({ text: text(1000).min(1) })), async c =>
    c.json({ drafts: await c.var.services.quickadd.parse(c.req.valid('json').text) }))

  .post('/save', json(z.object({
    items: z.array(z.object({ command, rawMerchant: text(120).optional(), suggestedMerchant: text(120).optional() })).min(1).max(50),
  })), async c => c.json({ ids: await c.var.services.quickadd.save(c.req.valid('json').items) }, 201));
