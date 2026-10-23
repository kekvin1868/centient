// /api/me, /api/workspace, /api/catalog, /api/prices, /api/backup, /api/export.csv
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { json, text } from '../../lib/schemas';

export const workspaceRoutes = new Hono<AppEnv>()
  .get('/me', async c => c.json(await c.var.services.workspace.me()))

  .patch('/workspace', json(z.object({ name: text(80).min(1).optional(), cycle_start_day: z.number().int().min(1).max(31).optional(), onboarded: z.literal(true).optional() })), async c => {
    await c.var.services.workspace.update(c.req.valid('json'));
    return c.json({ ok: true });
  })

  .post('/workspace/reset', async c => {
    await c.var.services.workspace.reset();
    return c.json({ ok: true });
  })

  .get('/catalog', async c => c.json(await c.var.services.workspace.catalog()))

  .get('/prices', async c => c.json(await c.var.services.workspace.prices()))

  .get('/backup', async c => c.json(await c.var.services.workspace.backup()))

  .get('/export.csv', async c => {
    const csv = await c.var.services.workspace.csv();
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"' });
  });
