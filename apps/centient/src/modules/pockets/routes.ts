// /api/envelopes: pockets inside an account.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { cursor, day, hex, id, json, money, patch, query, text } from '../../lib/schemas';

export const pocketsRoutes = new Hono<AppEnv>()
  .post(
    '/',
    json(
      z.object({
        accountId: id,
        name: text(60).min(1),
        kind: z.enum(['SPENDING', 'SAVINGS', 'GOAL']).default('SPENDING'),
        targetAmount: money.nullish(),
        targetDate: day.nullish(),
        color: hex.nullish(),
      }),
    ),
    async c => c.json(await c.var.services.pockets.create(c.req.valid('json')), 201),
  )

  // A goal's movements with the balance after each, and how it stands. Cursor `occurred_at|entryId`.
  .get(
    '/:id/activity',
    query(
      z.object({
        cursor: cursor.optional(),
      }),
    ),
    async c =>
      c.json(await c.var.services.pockets.activity(c.req.param('id'), c.req.valid('query').cursor)),
  )

  // A pocket's kind switches between Spending and Savings only (a goal stays a goal).
  .patch(
    '/:id',
    json(patch.extend({ kind: z.enum(['SPENDING', 'SAVINGS']).optional() })),
    async c => {
      await c.var.services.pockets.update(c.req.param('id'), c.req.valid('json'));
      return c.json({ ok: true });
    },
  );
