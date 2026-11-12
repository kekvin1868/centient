// /api/inbox: payments waiting for the owner's OK (a CSV import brings them in).
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { day, id, json, text } from '../../lib/schemas';

const row = z.object({
  date: day,
  /** Signed minor units: below zero is money out. */
  amount: z
    .number()
    .int()
    .refine(n => n !== 0, 'An amount is never zero'),
  merchant: text(120).optional(),
  note: text(500).optional(),
  accountId: id,
  categoryId: id.nullish(),
});

export const inboxRoutes = new Hono<AppEnv>()
  .get('/', async c => c.json(await c.var.services.inbox.list()))

  .get('/count', async c => c.json({ waiting: await c.var.services.inbox.count() }))

  .post('/import', json(z.object({ rows: z.array(row).min(1).max(5000) })), async c =>
    c.json(await c.var.services.inbox.importRows(c.req.valid('json').rows), 201),
  )

  .post('/add-all', json(z.object({ importId: id.optional() })), async c =>
    c.json({ added: await c.var.services.inbox.addAll(c.req.valid('json').importId) }),
  )

  .delete('/imports/:id', async c =>
    c.json(await c.var.services.inbox.undoImport(c.req.param('id'))),
  )

  .patch('/:id', json(z.object({ categoryId: id.nullable() })), async c => {
    await c.var.services.inbox.setCategory(c.req.param('id'), c.req.valid('json').categoryId);
    return c.json({ ok: true });
  })

  .post('/:id/add', async c => {
    await c.var.services.inbox.add(c.req.param('id'));
    return c.json({ ok: true });
  })

  .post('/:id/link', async c => {
    await c.var.services.inbox.link(c.req.param('id'));
    return c.json({ ok: true });
  })

  .post('/:id/dismiss', async c => {
    await c.var.services.inbox.dismiss(c.req.param('id'));
    return c.json({ ok: true });
  });
