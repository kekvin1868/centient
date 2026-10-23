// /api/installments, and /api/files for their proof of payment.
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { day, id, json, money, query, text } from '../../lib/schemas';

const share = (c: { req: { param(k: 'id' | 'no' | 'seq'): string } }) =>
  [c.req.param('id'), Number(c.req.param('no')), Number(c.req.param('seq'))] as const;

export const installmentsRoutes = new Hono<AppEnv>()
  .get('/installments', query(z.object({ account: id.optional() })), async c =>
    c.json({ plans: await c.var.services.installments.list(c.req.valid('query').account) }))

  .post('/installments', json(z.object({
    accountId: id, name: text(80).min(1), amountPerInstallment: money, installments: z.number().int().min(1).max(60), firstDue: day,
    paidCount: z.number().int().min(0).max(59), myShare: z.number().int().min(0),
    others: z.array(z.object({ name: text(60).min(1), iouAccountId: id.optional(), share: money })).max(9),
    alreadyInBalance: z.boolean(), categoryId: id.optional(),
  })), async c => c.json(await c.var.services.installments.create(c.req.valid('json')), 201))

  .delete('/installments/:id', async c => {
    await c.var.services.installments.remove(c.req.param('id'));
    return c.json({ ok: true });
  })

  .post('/installments/:id/payments', json(z.object({
    no: z.number().int().min(1), seq: z.number().int().min(0), fromAccountId: id.optional(), date: day.optional(),
  })), async c => {
    const { no, seq, ...rest } = c.req.valid('json');
    return c.json(await c.var.services.installments.markPaid(c.req.param('id'), no, seq, rest));
  })

  .delete('/installments/:id/payments/:no/:seq', async c => c.json(await c.var.services.installments.unmarkPaid(...share(c))))

  // multipart/form-data with one `file` field.
  .post('/installments/:id/payments/:no/:seq/proof', validator('form', v => z.object({ file: z.instanceof(File) }).parse(v)), async c => {
    const { file } = c.req.valid('form');
    return c.json(await c.var.services.installments.attachProof(...share(c), { name: file.name, type: file.type, bytes: await file.arrayBuffer() }));
  })

  .delete('/installments/:id/payments/:no/:seq/proof', async c => c.json(await c.var.services.installments.removeProof(...share(c))))

  // Private files, served only to their workspace; never cached by shared caches.
  .get('/files/:id', async c => {
    const f = await c.var.services.installments.file(c.req.param('id'));
    return c.body(f.body as ReadableStream, 200, {
      'Content-Type': f.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${f.filename.replace(/["\\\r\n]/g, '_')}"`,
    });
  });
