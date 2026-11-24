// /api/recurring: subscriptions and other bills that leave on a date.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../context';
import { day, id, json, money, text } from '../../lib/schemas';

const bill = z.object({
  name: text(60).min(1),
  accountId: id,
  envelopeId: id.nullish(),
  categoryId: id,
  /** null = the amount varies. */
  amount: money.nullish(),
  everyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  nextDue: day,
  endsOn: day.nullish(),
  service: text(40).nullish(),
  note: text(500).nullish(),
});

export const recurringRoutes = new Hono<AppEnv>()
  .get('/', async c => c.json(await c.var.services.recurring.list()))

  .post('/', json(bill), async c =>
    c.json({ id: await c.var.services.recurring.create(c.req.valid('json')) }, 201),
  )

  .get('/found', async c => c.json({ found: await c.var.services.recurring.found() }))

  .post('/found/hide', json(z.object({ merchant: text(120).min(1) })), async c => {
    await c.var.services.recurring.hide(c.req.valid('json').merchant);
    return c.json({ ok: true });
  })

  .patch('/:id', json(bill.partial().extend({ paused: z.boolean().optional() })), async c => {
    await c.var.services.recurring.update(c.req.param('id'), c.req.valid('json'));
    return c.json({ ok: true });
  })

  .delete('/:id', async c => {
    await c.var.services.recurring.remove(c.req.param('id'));
    return c.json({ ok: true });
  })

  // "Log interest" on a card bill, tagged by where it came from. Sent from the phone's outbox: `id` is the entry id
  // the phone made (a repeat is saved once), `closedOn` the bill it was typed for.
  .post(
    '/cards/:accountId/interest',
    json(
      z.object({
        id: id.optional(),
        closedOn: day.optional(),
        amount: money,
        from: z.union([
          z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
          z.object({ planId: id }),
        ]),
      }),
    ),
    async c =>
      c.json(
        {
          entryId: await c.var.services.recurring.logInterest(
            c.req.param('accountId'),
            c.req.valid('json'),
          ),
        },
        201,
      ),
  )

  // "Enter statement" on a card bill: the bank's total and minimum, for the bill closed on `closedOn`.
  .put(
    '/cards/:accountId/statement',
    json(
      z.object({
        closedOn: day,
        total: z.number().int().min(0),
        minimum: z.number().int().min(0).nullish(),
      }),
    ),
    async c => {
      await c.var.services.recurring.setStatement(c.req.param('accountId'), c.req.valid('json'));
      return c.json({ ok: true });
    },
  )

  .post('/:id/paid', json(z.object({ date: day.optional(), amount: money.optional() })), async c =>
    c.json({
      entryId: await c.var.services.recurring.paid(c.req.param('id'), c.req.valid('json')),
    }),
  );
